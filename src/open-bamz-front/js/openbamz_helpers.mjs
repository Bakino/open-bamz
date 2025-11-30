function graphqlObjectToHierarchy(obj){
    let str = "" ;
    for(let [k, value] of Object.entries(obj)){
        str += k ;
        if(typeof(value) === "object"){
            str += ` {
            ${graphqlObjectToHierarchy(value)}
            }`
        }
        str += "\n" ;
    }
    return str;
}


const openbamz = {
    CACHE_GRAPHQL_SCHEMA: {},
    queryGraphql : async function (query, appName){
        if(!appName){
            appName = window.BAMZ_APP ;
        }
        let headers = {
            "Content-Type": "application/json",
            Accept: "application/json",
        } ;
        let result = await fetch("/graphql/"+appName, {
            method: "POST",
            headers: headers,
            credentials: "include",
            body: JSON.stringify({ query: query }),
        }) ;
        let jsonResult = await result.json() ;
        if(jsonResult.errors){
            console.error("Error while call query "+query, jsonResult) ;
            throw jsonResult.errors.map(e=>e.message).join(",")
        }
        return jsonResult ;
    },
    graphqlMutation: async function(name, params, expectedResults, appName){
        let result = await window.openbamz.queryGraphql(`mutation ${name} {
            ${name}(
                input: { ${Object.keys(params).map(k=>
                    `${k} : ${JSON.stringify(params[k]).replace(/"(\w+)":/g, '$1:')}`).join(",") }
                }
            ) {
                ${expectedResults?graphqlObjectToHierarchy(expectedResults):"result"}
            }
        }`, appName);
        if(expectedResults){
            let results = {} ;
            for(let k of Object.keys(expectedResults)){
                results[k] = result.data[name][k] ;
            }
            return results;
        }else{
            return result.data[name].result;
        }
    },
    authenticate: async function (email, password){
        let response = await fetch("/auth/login", {
            body: JSON.stringify({ email, password }),
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        })
        if(!response.ok){
            return false ;
        }
        try{
            response = await response.json() ;
            return response.ok ;
        }catch(err){
            console.warn("Error parsing JSON response", err) ;
            return false ;
        }
    },
    refreshAuth: async function (){
        let response = await fetch("/auth/refresh", {
            method: "POST",
            credentials: "include"
        });
        return response.ok ;
    },
    logout: async function (){
        let response = await fetch("/auth/logout", { method: "POST", credentials: "include" }) ;
        if(!response.ok){
            console.warn("Error during logout", response.statusText) ;
        }
    },
    createAccount: async function (email, password, name){
        let checkExists = await window.openbamz.queryGraphql(`mutation checkaccountexists {
            check_account_exists(input: {user_email: "${email}"}) {
            result 
            }
            }`, "_openbamz");
        if(checkExists.errors){ throw "UNEXPECTED_ERROR" ; }
        if(checkExists?.data?.check_account_exists?.result){ throw "ALREADY_EXISTS" ; }

        let result = await window.openbamz.queryGraphql(`mutation createaccount {
create_account(input: {user_email: "${email}", password: "${password}", name: "${name}"}) {
result {
create_time
email
role
name
}
}
}`, "_openbamz");
        if(result.errors){
            throw "UNEXPECTED_ERROR" ;
        }
        return result;
    },
    loadCss : async function(url){
        let head = document.head;
        return new Promise((resolve)=>{
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = url;
            
            
            head.appendChild(link);
            resolve() ;
        }) ;
    }
}

window.openbamz = openbamz;

export default openbamz ;


