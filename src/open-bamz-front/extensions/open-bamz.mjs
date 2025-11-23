export default {
    globals: {
        checkLogged: async ()=>{
            try{
                const refreshed = await window.openbamz.refreshAuth()
                if(!refreshed){
                    window.location.hash = "#/login/"+encodeURIComponent(window.location.href) ;
                    return false;
                }
                return true;
            }catch(err){
                console.log("refresh token failed", err) ;
                window.location.hash = "#/login/"+encodeURIComponent(window.location.href) ;
                return false;
            }
        }
    }
}