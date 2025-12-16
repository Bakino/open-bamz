export default {
    extends: {
        checkLogged: async function(){
            try{
                const refreshed = await window.openbamz.refreshAuth()
                if(!refreshed){
                    this.abortRender() ;
                    window.location.hash = "#/login/"+encodeURIComponent(window.location.href) ;
                    return false;
                }
                return true;
            }catch(err){
                console.log("refresh token failed", err) ;
                this.abortRender() ;
                window.location.hash = "#/login/"+encodeURIComponent(window.location.href) ;
                return false;
            }
        }
    }
}