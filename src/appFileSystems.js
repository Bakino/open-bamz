const { writeFile, readFile, readdir } = require("fs/promises");
const { ensureDir, remove, pathExists } = require("fs-extra");
const path = require("path") ;
const logger = require("./logger");

class AppFileSystem {
    constructor(appName){
        this.appName = appName ;
        this.listeners = {} ;
    }
    getAppPath(branch = "public"){
        return path.join(process.env.DATA_DIR, "apps", this.appName, branch) ;
    }
    async addListener(event, listener){
        if(!this.listeners[event]){
            this.listeners[event] = [] ;
        }
        this.listeners[event].push(listener) ;
    }
    async emit(event, data){
        if(this.listeners[event]){
            for(let listener of this.listeners[event]){
                try{
                    const relativePath = path.relative(this.getAppPath(data.options?.branch??"public"), data.filePath||"") ;
                    await listener({...data, appName: this.appName, relativePath, branch: data.options?.branch??"public"}) ;
                }catch(err){
                    logger.error("Error while emitting app filesystem event %o", err) ;
                }
            }
        }
    }
    async writeFile(filePath, data, options = {}){
        const fullPath = path.join(this.getAppPath(options.branch??"public"), filePath) ;
        await ensureDir(path.dirname(fullPath)) ;
        await writeFile(fullPath, data, options) ;
        await this.emit("fileWritten", {filePath: fullPath, data, options}) ;
    }
    async readFile(filePath, options = {}){
        const fullPath = path.join(this.getAppPath(options.branch??"public"), filePath) ;
        const data = await readFile(fullPath, options) ;
        return data ;
    }
    async pathExists(filePath, options = {}){
        const fullPath = path.join(this.getAppPath(options.branch??"public"), filePath) ;
        try{
            await pathExists(fullPath) ;
            return true ;
        }catch{
            return false ;
        }
    }
    async remove(filePath, options = {}){
        const fullPath = path.join(this.getAppPath(options.branch??"public"), filePath) ;
        await remove(fullPath) ;
        await this.emit("fileDeleted", {filePath: fullPath, options}) ;
    }

    async listAllFiles(branch = "public"){
        const basePath = this.getAppPath(branch);

        const results = [];

        async function recurse(current) {
            const entries = await readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    await recurse(full);
                } else if (entry.isFile()) {
                    results.push(path.relative(basePath, full));
                }
            }
        }

        await recurse(basePath);
        return results;
    }
}

class AppFileSystems {
    constructor(){
        this.fileSystems = {} ;
        this.listeners = {} ;
    }
    getFileSystem(appName){
        if(!this.fileSystems[appName]){
            this.fileSystems[appName] = new AppFileSystem(appName) ;
            for(let event of Object.keys(this.listeners)){
                for(let listener of this.listeners[event]){
                    this.fileSystems[appName].addListener(event, listener) ;
                }
            }
        }
        return this.fileSystems[appName] ;
    }
    async addListener(event, listener){
        if(!this.listeners[event]){
            this.listeners[event] = [] ;
        }
        this.listeners[event].push(listener) ;
        for(let fs of Object.values(this.fileSystems)){
            fs.addListener(event, listener) ;
        }
    }
}

const appFileSystems = new AppFileSystems() ;
module.exports = {
    appFileSystems
} ;