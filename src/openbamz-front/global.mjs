window.checkLogged = async ()=>{
    try{
        const refreshed = await window.openbamz.refreshAuth()
        if(!refreshed){
            window.location.href = "/openbamz/login/"+encodeURIComponent(window.location.href) ;
            return false;
        }
        return true;
    }catch(err){
        console.log("refresh token failed", err) ;
        window.location.href = "/openbamz/login/"+encodeURIComponent(window.location.href) ;
        return false;
    }
}