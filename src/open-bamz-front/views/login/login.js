//Script goes here

view.signIn = async function(){
    waiter(async ()=>{
        const form = view.querySelector("form") ;
        if(bootstrap5.validateForm(form)){
            view.data.failed = false;
            let success = await window.openbamz.authenticate(view.data.login, view.data.password)
            if(success){ 
                view.router.navigateTo("/") ;
            }else{
                view.data.failed = true;
            }
        }
    })
}