/*global view*/

view.createAccount = async function(){
    waiter(async ()=>{
        const form = view.querySelector("form") ;
        if(bootstrap5.validateForm(form)){
            view.data.failed = false;
            try{
                await window.openbamz.createAccount(view.data.login, view.data.password, view.data.name) ;
                view.router.navigateTo("/login") ;
            }catch(err){
                if(err === "ALREADY_EXISTS"){
                    bootstrap5.dialogs.error({message: "This account name already exists"}) ;
                }else{
                    bootstrap5.dialogs.error({message: "An unexpected error happens"}) ;
                }
            }
        }
    })
}