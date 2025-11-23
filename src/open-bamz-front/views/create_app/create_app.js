/*global view*/

view.createApp = async function(){
    waiter(async ()=>{
        const form = view.querySelector("form") ;
        if(bootstrap5.validateForm(form)){
            view.data.failed = false;
            let result = await window.openbamz.queryGraphql(`mutation create_application {
                create_application(input: {name: "${view.data.name.replaceAll('"', '\\"')}"}) {
                    clientMutationId
                }
            }`, "_openbamz");

            if(result.errors){
                view.data.failed = true;
                view.data.error = result.errors.map(e=>e.message).join("<br>") ;
            }else{ 
                view.router.navigateTo("/") ;
            }
        }
    })
}