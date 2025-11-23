/* globals view, checkLogged */
//Script goes here

view.loader = async ()=>{
    if(!(await checkLogged())){
        return {} ;
    }
    let listapps;
    let user;
    try{
        let results = await window.openbamz.queryGraphql(`query listapps {
            all_app {
                nodes {
                    code
                    name
                    owner
                    hosts
                    admins
                }
            }
        }`, "_openbamz");
        listapps = results.data.all_app.nodes
    }catch(err){
        listapps = [];
    }

    try{
        let results = await window.openbamz.queryGraphql(`mutation MyMutation {
            read_account(input: {}) {
                result {
                _id
                create_time
                email
                name
                role
                }
            }
        }`, "_openbamz");
        user = results.data.read_account.result
    }catch(err){
        user = null;
    }
    

    return {
        apps: listapps,
        user: user
    }
};

view.logout = async()=>{
    window.openbamz.logout() ;
    view.router.navigateTo("/login")
}