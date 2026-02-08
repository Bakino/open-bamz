//migration onPluginLoad=>loadPluginData

# Open BamZ documentation

## What is Open BamZ ?

Open BamZ is both an application runtime and a plugin manager.

User use Open BamZ to create application, they activate plugins and use them to write their application code.

The application is served using Open BamZ as well.

## Open BamZ structure

### Main database

The Open BamZ platform has a main database that will contains : 
 - the list of user account (in table `account`)
 - the list of application (in table `app`)

To create an application, you need an account. Then when you create the application from your account, your account become the owner of the application.

### Application structure

An application is composed of a database and a file directory.

The database is at least used to contains the list of plugins activated for this application (in `openbamz.plugins` table). The plugins can also use it to store some metadata if needed.

If the application need data storage, it can of course create table in its database to store data.

The file directory contains the code source of the application.
It is the **front-end** code only.

If you need to execute server side code, you can either : 
 - create function and trigger in database (using javascript through plv8 or classical PL/pgSQL if you wish)
 - create a custom plugin of your own

### PostGraphile

To access the database from the application, Open BamZ use PostGraphile to provide standard GraphQL server to the application

### Schema structure and access right

By default an application database has 2 schemas : 
 - openbamz : metadata such as the list of installed plugin
 - public : standard public schema that should contains application tables

The plugins are supposed to create their own schema when they involve database storage for the plugin settings or data

By default graphql will give access to the following schema : 
 - openbamz
 - public
 - each other schema which name is equals to the plugin name (for exemple schema `myplugin` of plugin named `myplugin`). 

If is totally possible to create other schema name but they won't be served through graphql (ex: you can create a `myplugin_private` schema that won't be accessible through graphql)

For each application database, the following roles are created : 
 - `dbname`_admin
 - `dbname`_user
 - `dbname`_readonly

Each user came with his own role base on its user account uuid. When the database is created the user role is granted with `dbname`_admin role.

All privileges are granted on public and openbamz schema to the `dbname`_admin role

The roles `dbname`_user and `dbname`_readonly cam with the right to execute functions on public and openbamz

The role `dbname`_user can read an write tables in public schema

The role `dbname`_readonly can read in public schema

Here is a summary : 
| **Schema**      | **Role**               | **SELECT** | **INSERT** | **UPDATE** | **DELETE** | **EXECUTE Functions** | **Notes**                          |
|-----------------|------------------------|------------|------------|------------|------------|-----------------------|------------------------------------|
| **openbamz**    | `dbname_admin`         | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes                 | Full control over metadata.        |
|                 | `dbname_user`          | ❌ No       | ❌ No       | ❌ No       | ❌ No       | ✅ Yes                 | No direct table access.            |
|                 | `dbname_readonly`     | ❌ No       | ❌ No       | ❌ No       | ❌ No       | ✅ Yes                 | No direct table access.            |
| **public**      | `dbname_admin`         | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes                 | Full control over application tables. |
|                 | `dbname_user`          | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes      | ✅ Yes                 | Can read/write tables.              |
|                 | `dbname_readonly`     | ✅ Yes      | ❌ No       | ❌ No       | ❌ No       | ✅ Yes                 | Read-only access to tables.         |
| **Plugin Schemas** | Any Role          | Depends on plugin definition | Depends on plugin definition | Depends on plugin definition | Depends on plugin definition | Depends on plugin definition | Plugins define their own access rules. | 

### Plugins

The Open BamZ core does not do anything more that what is described above : 
 - Handle account
 - Create/Delete application database/directory
 - Provide GraphQL for each application
 - Serves applications and inject plugins to them

The rest of the job is done by the plugins

#### Plugin structure

A plugin is a Node.js project. 
It can use module syntax or classical require syntax. If it use the module syntax, add `"type": "module"` in its `package.json` and use `.mjs` extension.

Add the plugin entry file in `main` property of `package.json`

#### Plugin entry point

The plugin entry point is loaded on plugin start. It will prepare database and fields and register routes and dependencies

##### Prepare database and files

In the plugin entry point, you must export a function `prepareDatabase`. This function will be called when the plugin is added to the application and each time the application start.

It is intended to prepare the database structure needed for the plugin and create some files in the filesystem if needed.

As it is run at each startup, you should use pattern "create if not exists".

This function receive a param like this : 
```javascript
prepareDatabase({client, options, grantSchemaAccess, filesDirectory, logger});
```

| Param | Description |
|-------|-------------|
| client | Database client. You can call [`client.query`](https://node-postgres.com/apis/client#clientquery) |
| options | Database connection options (useful to get the database/application name in `options.database`) |
| grantSchemaAccess | Helper function to grant default schema access to some role. Useful to grant access to a schema you create to handle your plugin data |
| filesDirectory | Path to the directory that contains the files of the plugin |
| logger | a logger instance |
| `appFileSystems` | This is a helper class to write file to application directory |



##### Clean database

In the plugin entry point, you must export a function `cleanDatabase`. This function will be called when the plugin is removed from the application.

It is intended to delete data related to this plugin in the database.

A good practice is to create a schema dedicated to your plugin, so to clean data, you only need to remove the schema.


This function receive a param like this : 
```javascript
prepareDatabase({client, options, grantSchemaAccess, filesDirectory});
```

| Param | Description |
|-------|-------------|
| client | Database client. You can call [`client.query`](https://node-postgres.com/apis/client#clientquery) |
| `appFileSystems` | This is a helper class to write file to application directory |


##### Init plugin

In the plugin entry point, you must export a function `initPlugin`. This function is called when the Open BamZ platform start (not the application, the global platform)

It is intended to prepare everything that the plugin need to work. Such as register entry point, serve front-end files or extends other plugins

This function receive a param like this : 
```javascript
initPlugin({contextOfApp, loadPluginData, hasCurrentPlugin, injectBamz, app, logger, graphql, runQuery, io});
```

| Param | Description |
|-------|-------------|
| `contextOfApp(appName)` | This is a helper function to get the context of an application by its application name. It returns `{pluginsData: {...}}` where `pluginsData` contains the data of each plugin activated for this application. See more details below on how to communicate between plugins |
| `appFileSystems` | This is a helper class to write file to application directory |
| `loadPluginData(({pluginsData, appName, client})=>{})` | This helper function add a function that will be called to communicate data between plugins (see dedicated section below). Use the give db client instead of runQuery to avoid connection leak  |
| `userLoggedAndHasPlugin(req, res)` | Reject a request if the user is not logged or the plugin is not activated for the current application |
| `hasCurrentPlugin(appName)` | This is a helper function to check if this plugin is currently activated to an application. A common usage is to call it in the added router middlewares to check that the plugin is activated before perform its action |
| `injectBamz(html, appName)` | This is a helper function that inject BamZ loading code into a HTML code. This is done automatically by BamZ file serving, but if your plugin override to do something like SSR, you may need to use it to inject BamZ loading code in your handler  |
| `app` | The express app instance |
| `logger` | The winston logger instance |
| `graphql` | The graphql helper TOCOMPLETE |
| `runQuery({database}, sql, params)` | This is a helper to run SQL query |
| `io` | the socket.io instance |

The `initPlugin` function plugin must return a plugin data structure with the following properties : 

| Param | Description |
|-------|-------------|
| `frontEndPath` | The path to the front-end path to serve. The front-end path will be serve as `/plugin/:appName/${pluginName}/` |
| `frontEndLib` | Can be path to one javascript lib file or an array of javascript lib files. These files will be automatically loaded on application start. This path must be relative to `frontEndPath` |
| `frontEndPublic` | Path of the front end that is accessible without being admin of the application (can take a single string or an array of strings). |
| `graphqlSchemas` | By default if the plugin create a schema that has the same name as the plugin, this schema is accessible through graphql. If you need another schema to be available through graphql, give the schemas names in this property (can take a single string or an array of strings) |
| `router` | express router that contains server middlewares needed for this plugin. see [Add server side API (express router)](#add-server-side-api-express-router) |
| `menu` | Entries in the top menu that is automatically injected to the application |
| `pluginSlots` | data slots in which other plugin can inject extension to this plugin |

##### Manage application files (appFileSystems)

To manage the application files, you should use the appFileSystems helper.

To get the instance of appFileSystem of an application call : 
```javascript
const appFs = appFileSystems.getFileSystem(appName)
```

Then you can call the following functions : 
```javascript
//write binary
appFs.writeFile("path/to/file.ext", fileBuffer) ;
//write text
appFs.writeFile("path/to/file.txt", textContent, { encoding: "utf8"}) ;

//read binary
const buffer = await appFs.readFile("path/to/file.ext") ;
//read text
const buffer = await appFs.readFile("path/to/file.text", { encoding: "utf8"}) ;

//check if a file exists
if(await appFs.readFpathExistsile("path/to/file.text")){
    //...
}

//remove a file or a folder
await appFs.remove("path/to/file/or/folder") ;
```

If your plugin need to do something when a file changed you can listen to file system events
```javascript
appFileSystems.addListener("fileWritten", async ({appName, filePath, relativePath, branch})=>{
    console.log(`The file ${filePath} has been written !`) ;
}) ;

appFileSystems.addListener("fileDeleted", async ({appName, filePath, relativePath, branch})=>{
    console.log(`The file ${filePath} has been deleted !`) ;
}) ;
```

##### Add server side API (express router)

If your plugin need to add server side API route, you must create a router in the `initPlugin` function : 

```javascript
import express from "express";

export const initPlugin = async ({app, runQuery, logger, loadPluginData, contextOfApp, hasCurrentPlugin}) => {
    // create the router
    const router = express.Router();

    // this will be served under /${myPluginName}/my/api/entry/point
    router.get('/my/api/entry/point', (req, res, next) => {
        // ...
    });

    // this will be served under /${myPluginName}/a/post/entry/point
    router.post('/a/post/entry/point', (req, res, next) => {
        // ...
    });

    //return the router
    return {
        // ...
        router: router,
        // ...
    }
} ;
```


##### Serve plugin front-end files

If your plugin provide features to the front-end or provide some settings screens, you must give the needed front-end file path.

For example, you can have the following plugin directory structure :
```
 myplugin/
   package.json
   index.mjs
   front-end/
     lib/
       my-plugin-lib.js
     admin/
       my-plugin-admin-screen.html
       my-plugin-admin-screen.css
       my-plugin-admin-screen.js
```

In this example structure, the `front-end` directory contains all files needed for the front-end, It contains a `lib` directory with the plugin lib file and `admin` directory with the settings screen that will be available from the menu

in the `initPlugin` function, you must return :
```javascript
{
    // path in which the plugin provide its front end files
    frontEndPath: "front-end",
    // path to the lib to load on the application startup
    frontEndLib: "lib/my-plugin-lib.mjs", // it can also be an array of files
    // add menu entries
    menu: [
        {
            name: "admin", entries: [
                { name: "My plugin setting screen", link: "/plugin/:appName/myPlugin/admin/my-plugin-admin-screen.html" }
            ]
        }
    ],
}
```

##### Extends plugins each others

The plugins may need to extends feature of other plugins.

###### Prepare slots

For a plugin to be extended, it must provide `slots` to inject elements from other plugin.

To declare slots, you must add the property `pluginSlots` in the returned structure of the function `initPlugin` : 

```javascript
{
    frontEndPath: "front-end",
    frontEndLib: "lib/my-plugin-lib.mjs",
    menu: [/*...*/],

    // add slots to inject feature from other plugins
    pluginSlots: {
        myFeatureExtensions: [],
        otherFeatureExtension: []
    }
}
```

###### Register extension from other plugins

In the plugin that need to register an extension to the feature, it must call the function `loadPluginData` in the `initPugin` function

```javascript
// The function is received in initPlugin params ----------vvvvvvvv
export const initPlugin = async ({app, runQuery, logger, loadPluginData, contextOfApp, hasCurrentPlugin}) => {

    loadPluginData(async ({pluginsData})=>{
        // The function receive the pluginsData structure that expose the slotsd
        if(pluginsData?.["plugin-to-extend"]?.pluginSlots?.myFeatureExtensions){
            pluginsData?.["plugin-to-extend"]?.pluginSlots?.myFeatureExtensions.push( {
                /* whatever data to give to the plugin to be used as extension, the extension design is yours */
            })
        }
    })
};
```

###### Access extensions in the main plugin

The plugins data are available through the context of the application. We can use the function `contextOfApp` to get access to it

```javascript
// The function is received in initPlugin params --------------------------vvvvvvvv
export const initPlugin = async ({app, runQuery, logger, loadPluginData, contextOfApp, hasCurrentPlugin}) => {

    // example of usage in a route
    router.get('/plugin-to-extend/:appName', async (req, res, next) => {
        const appName = req.params.appName ;
        if(await hasCurrentPlugin(appName)){ // good practice to check that the plugin is activated on this app
            // get the context of the app
            const appContext = await contextOfApp(appName) ;

            // get all loaded extensions of other plugin
            const myFeatureExtensions = appContext.pluginsData["plugin-to-extend"]?.pluginSlots?.myFeatureExtensions??[] ;

            // do whatever you with it
        }
    }) ;

};
```

###### Pattern to serve front-end extension

The example code above load some extension data in a backend router but there is no direct access to pluginsData on the front-end side

Here is an example of how to load some extension that need to be used on the front-end side

First the code on a main plugin `my-front-end-plugin`
```javascript
export const initPlugin = async ({ contextOfApp, hasCurrentPlugin, loadPluginData }) => {

    // if you don't have one yet, create a router to serve extensions
    const router = express.Router();

    // serve extensions
    router.get('/my-front-end-plugin-extensions/:appName', async (req, res, next) => {
        const appName = req.params.appName ;
        if(!appName){ return res.status(400).end("Missing appName") ; }

        if(await hasCurrentPlugin(appName)){ // check this plugin is activated on this app
            // get the app context
            const appContext = await contextOfApp(appName) ;

            // retrieve extension from other plugins
            let registeredExtensions = appContext.pluginsData["my-front-end-plugin"]?.pluginSlots?.frontEndExtensions??[] ;

            // generate javascript file that import front-end extension from other plugins
            let js = `let extensions = [];`;
            for(let i=0; i<registeredExtensions.length; i++){
                let ext = registeredExtensions[i];
                js += `
                import ext${i} from "${ext.extensionPath.replace(":appName", appName)}" ;
                extensions.push({ plugin: "${ext.plugin}", ...ext${i}}) ;
                `
            }
            js += `export default extensions`;
            res.setHeader("Content-Type", "application/javascript");
            res.end(js);
        }else{
            // this plugin is not activated, skip this middleware
            next() ;
        }
    });

    // it is possible for a plugin to inject an extension to itself
    loadPluginData(async ({pluginsData})=>{
        if(pluginsData?.["my-front-end-plugin"]?.pluginSlots?.frontEndExtensions){
            pluginsData?.["my-front-end-plugin"]?.pluginSlots?.frontEndExtensions.push( {
                plugin: "my-front-end-plugin",
                extensionPath: "/plugin/:appName/my-front-end-plugin/extension/bundled-extension.mjs"
            })
        }
        
    })

    return {
        // path in which the plugin provide its front end files
        frontEndPath: "front-end",

        // don't forget to register the router
        router: router,
        
        // don't forget to register the plugin slot
        pluginSlots: {
            frontEndExtensions: [],
        }
        
    }
};
```

Still in the main plugin `my-front-end-plugin`, somewhere in the front end code, you can load extensions 
```javascript
const extensions = (await import(`/my-front-end-plugin/my-front-end-plugin-extensions/${window.BAMZ_APP}`)).default ;

//extensions is the list of loaded extension, do what you need with it
```

In the plugin that provide extension `my-front-end-extension`, we register the extension in the `initPlugin`
```javascript
export const initPlugin = async ({ contextOfApp, hasCurrentPlugin, loadPluginData }) => {

   
    // it is possible for a plugin to inject an extension to itself
    loadPluginData(async ({pluginsData})=>{
        if(pluginsData?.["my-front-end-plugin"]?.pluginSlots?.frontEndExtensions){
            pluginsData?.["my-front-end-plugin"]?.pluginSlots?.frontEndExtensions.push( {
                // give the plugin name for information
                plugin: "my-front-end-extension", 
                // this is the path where the extension file will be served
                // as the file is in the front-end static files of our extension plugin, it starts by /plugin/:appName/my-front-end-extension/
                extensionPath: "/plugin/:appName/my-front-end-extension/extension/my-extension.mjs"
            })
        }
        
    })

    return {
        // path in which the plugin provide its front end files
        frontEndPath: "front-end",
    }
};
```

Still in the extension plugin `my-front-end-extension`, we add the extension file itself in `front-end/my-extension.mjs` : 
```javascript
const someExtensionLogic = { /* do whatever code you need in that */ }

// what is important is that you export a default something because it is what will be provided at the end
export default someExtensionLogic ;
```




