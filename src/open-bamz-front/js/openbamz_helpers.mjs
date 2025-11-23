function underscoreToCamelCase(str) {
    // Handle empty or undefined string
    if (!str) return str;

    // Check if string starts with underscore and store it
    const startsWithUnderscore = str.startsWith('_');
    
    // Split the string by underscores and convert each word
    const converted = str
        .split('_')
        .filter(word => word) // Remove empty strings from split
        .map((word, index) => {
            // Convert word to lowercase first
            word = word.toLowerCase();
            
            // Handle numbers followed by letters within the word
            word = word.replace(/(\d)([a-z])/g, (match, number, letter) => {
                return number + letter.toUpperCase();
            });
            
            // Keep first word in lowercase unless it starts with a number
            if (index === 0) {
                return word;
            }
            // Capitalize first letter of other words
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join('');
    
    // Add leading underscore back if it existed in original string
    return startsWithUnderscore ? '_' + converted : converted;
}

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
        let jwt = localStorage.getItem("openbamz-jwt") ;
        if(jwt){
            headers.Authorization = "Bearer "+jwt
        }
        let result = await fetch("/graphql/"+appName, {
            method: "POST",
            headers: headers,
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
        localStorage.removeItem("openbamz-jwt") ;
        let result = await window.openbamz.queryGraphql(`mutation auth {
authenticate(input: {email: "${email}", password: "${password}"}) {
result
}
}`, "_openbamz");
        let token = result?.data?.authenticate?.result;
        if(token){
            localStorage.setItem("openbamz-jwt", token) ;
            return true
        }else{
            return false;
        }
    },
    fetchAuth: async function(url, options){
        try{
            const jwt = localStorage.getItem("openbamz-jwt") ;
            if(jwt){
                if(!options){
                    options = {} ;
                }
                if(!options.headers){
                    options.headers = {} ;
                }
                if(!options.headers.Authorization && !options.headers.authorization){
                    options.headers.Authorization = "Bearer "+jwt ;
                }
            }
        }catch(err){
            console.warn("Can't access to local storage", err) ;
        }
        return fetch(url, options) ;
    },
    fetchPostJson: async function(url, body, options){
        try{
            if(!options){
                options = {} ;
            }
            options.method = "POST" ;
            if(!options.headers){
                options.headers = {} ;
            }
            options.headers["Accept"] =  'application/json';
            options.headers["Content-Type"] =  'application/json';
            const jwt = localStorage.getItem("openbamz-jwt") ;
            if(jwt){
                if(!options.headers.Authorization && !options.headers.authorization){
                    options.headers.Authorization = "Bearer "+jwt ;
                }
            }
            options.body = JSON.stringify(body) ;
        }catch(err){
            console.warn("Can't access to local storage", err) ;
        }
        return fetch(url, options) ;
    },
    get: async function(options, queryParam){
        if(typeof options === "string"){
            options = {url: options, query: queryParam} ;
        }
        let {url, query} = options ;
        if(query){
            if(url.includes("?")){
                url += "&" ;
            }else{
                url += "?" ;
            }
            url += Object.keys(query).map(k=>`${k}=${query[k]}`).join("&") ;
        }
        let response = await this.fetchAuth(url);
        if(!response.ok){
            throw await response.text() ;
        }
        return await response.json() ;
    },
    post: async function(options, bodyParam){
        if(typeof options === "string"){
            options = {url: options, body: bodyParam} ;
        }
        let {url, body} = options ;
        let response = await this.fetchPostJson(url, body);
        if(!response.ok){
            throw await response.text() ;
        }
        return await response.json() ;
    },
    logout: async function (){
        localStorage.removeItem("openbamz-jwt") ;
    },
    refreshAuth: async function (){
        let result = await window.openbamz.queryGraphql(`mutation refresh {
refresh_auth(input: {}) {
    result
}
}`, "_openbamz");
        let token = result?.data?.refresh_auth?.result;
        if(token){
            localStorage.setItem("openbamz-jwt", token) ;
            return true
        }else{
            return false;
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


