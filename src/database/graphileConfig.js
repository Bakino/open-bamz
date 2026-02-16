const { PostGraphileAmberPreset } = require("postgraphile/presets/amber");
const { PostGraphileConnectionFilterPreset } = require("postgraphile-plugin-connection-filter");
//const { PgLazyJWTPreset } = require("postgraphile/presets/lazy-jwt");
//const { defaultMaskError } = require("postgraphile/grafserv");

/**
 * Plugin to change the way id are generated and named
 */
const IdToNodeIdPlugin = {
  name: "IdToNodeIdPlugin",
  version: "1.0.0",
  inflection: {
    replace: {
      // Override the default pluralize and camel case to keep "real names"
      pluralize: function(_defaultPluralize, _postgraphile, str) {
        return str
      },
      singularize: function(_defaultPluralize, _postgraphile, str) {
        return str
      },

      camelCase: function(_defaultPluralize, _postgraphile, str) {
        return str.replaceAll("-", "_") ;
      },
      upperCamelCase: function(_defaultPluralize, _postgraphile, str) {
        return str.replaceAll("-", "_") ;
      },
     
      nodeIdFieldName() {
        return "nodeId";
      },

      /*attribute(previous, options, details) {
        if (!previous) {
          throw new Error("There was no 'attribute' inflector to replace?!");
        }
        const name = previous(details);
        if (name === "rowId") {
          return "id";
        }
        return name;
      },*/
      //https://github.com/graphile/crystal/blob/f8c61573ca167a814b1567704b665e0bd2857170/.changeset/lazy-mayflies-design.md?plain=1#L27
      _attributeName(previous, options, details) {
          const { codec, attributeName } = details;
          const attribute = codec.attributes[attributeName];
          const baseName = attribute.extensions?.tags?.name || attributeName;
          const name = previous(details);
          if (baseName === "id" && name === "row_id" && !codec.isAnonymous) {
            return "id";
          }
          return name;
        },
    },
  },
};


const { makePgService } = require("postgraphile/adaptors/pg");

//Configuration for the main database
const mainDbPreset = {
    extends: [PostGraphileAmberPreset, /*PgLazyJWTPreset,*/ PostGraphileConnectionFilterPreset],
    plugins: [IdToNodeIdPlugin],
    disablePlugins: ['PgIndexBehaviorsPlugin'],
    pgServices: [makePgService({ 
        connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
        schemas: ["public"],
    })],
    // gather: {
    //     pgJwtTypes: "public.jwt_token",
    // },
    grafserv: { 
        watch: true,
        graphqlPath: `/graphql/${process.env.DB_NAME}`,
        graphiqlPath: `/graphiql/${process.env.DB_NAME}`,
        eventStreamPath: `/graphql/${process.env.DB_NAME}/stream`,
    },
    schema: {
        pgJwtSecret: process.env.JWT_SECRET,
        //recommended options to avoid expensive filter operation
        connectionFilterComputedColumns: false,
        connectionFilterSetofFunctions: false,
        connectionFilterArrays: false,
    },
    grafast: {
        context(requestContext, args) {
            const pgSettings = {
              ...args.contextValue?.pgSettings,
            }

            pgSettings.role = "anonymous";
            const req = requestContext.expressv4?.req;
            if(req?.jwt?.bamz){
                for (const [key, value] of Object.entries(req.jwt.bamz)) {
                    if (typeof value === "undefined" || value === null) continue;
                    if (!/^[a-z_][a-z0-9_]*$/i.test(key) || key.length > 52) continue;
                    pgSettings[`jwt.bamz.${key}`] = String(value);
                }
                pgSettings.role = req.jwt.bamz.role;
            }
            return {
              pgSettings: {
                ...pgSettings,
                //server side call can override the role
                ...args.contextValue?.forceRole,
              },
            };
        },
    },
};

// Create configuration for app database
function createAppPreset(options){
    const IS_MONO_DB = !!process.env.MONO_DATABASE ;

    const preset = {
        extends: [PostGraphileAmberPreset,/* PgLazyJWTPreset,*/ PostGraphileConnectionFilterPreset],
        plugins: [IdToNodeIdPlugin],
        disablePlugins: ['PgIndexBehaviorsPlugin'],
        pgServices: [makePgService({ 
            //connectionString: `postgres://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`,
            //connection must be done with super user because database user does not have to switch to role of secondary admin that are not db owner
            connectionString: `postgres://${options.superuser}:${options.superpassword}@${options.host}:${options.port}/${options.database}`,
            superuserConnectionString: `postgres://${options.superuser}:${options.superpassword}@${options.host}:${options.port}/${options.database}`,
            schemas: options.schemas??["public", "openbamz"],
        })],
        // gather: {
        //     pgJwtTypes: "public.jwt_token",
        // },
        grafserv: { 
            watch: true,
            graphqlPath: `/graphql/${options.database}`,
            graphiqlPath: `/graphiql/${options.database}`,
            eventStreamPath: `/graphql/${options.database}/stream`,
            maskError(error) {
              //const masked = defaultMaskError(error);
              //don't mask error to help admin fix there bug
              //TODO: should it be done depending on user ? or create hash and save it in private log table ? 
              return error;
            },
        },
        schema: {
            //pgJwtSecret: process.env.JWT_SECRET,
            //recommended options to avoid expensive filter operation
            connectionFilterComputedColumns: false,
            connectionFilterSetofFunctions: false,
            connectionFilterArrays: false,
        },
        grafast: {
            context(requestContext, args) {
                const pgSettings = {
                  ...args.contextValue?.pgSettings,
                }

                pgSettings.role = "anonymous";
                const req = requestContext.expressv4?.req;
                if(req && req.jwt){
                    let notBamzRole = null;
                    for(const [tokenName, tokenValue] of Object.entries(req.jwt)) {
                        for (const [key, value] of Object.entries(tokenValue)) {
                            if (typeof value === "undefined" || value === null) continue;
                            if (!/^[a-z_][a-z0-9_]*$/i.test(key) || key.length > 52) continue;
                            pgSettings[`jwt.${tokenName}.${key}`] = String(value);
                        }
                        if(tokenName !== "bamz" && tokenValue.role && typeof tokenValue.role === "string"){
                            notBamzRole = tokenValue.role;
                        }
                    }
                    // by default take role from bamz token
                    if (req.jwt.bamz?.role && typeof req.jwt.bamz.role === "string") {
                        pgSettings.role = req.jwt.bamz.role;
                    }
                    if(notBamzRole){
                        if(req.headers.referer && req.headers.referer.replace(req.headers.origin, "").startsWith("/plugin/")){
                            // come from a plugin, keep the bamz role because we need the admin right there
                        }else{
                            // not in a plugin, prefer the application role
                            pgSettings.role = notBamzRole;
                        }
                    }
                }
                if(req){
                  pgSettings["req.host"] = req.get('host') ;
                }
                return {
                  pgSettings: {
                    ...pgSettings,
                    //server side call can override the role
                    ...args.contextValue?.forceRole,
                  },
                };
            }
        },
    };
    if(IS_MONO_DB){
        // disable graphiql (ruru) GUI
        preset.grafserv.graphiqlOnGraphQLGET = false;
        preset.grafserv.graphiql = false;
        preset.grafserv.enhanceGraphiql = false;
    }
    return preset ;
}

module.exports.mainDbPreset = mainDbPreset;
module.exports.createAppPreset = createAppPreset;
