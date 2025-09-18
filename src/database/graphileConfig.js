const { PostGraphileAmberPreset } = require("postgraphile/presets/amber");
const { PostGraphileConnectionFilterPreset } = require("postgraphile-plugin-connection-filter");
const { PgLazyJWTPreset } = require("postgraphile/presets/lazy-jwt");
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
    extends: [PostGraphileAmberPreset, PgLazyJWTPreset, PostGraphileConnectionFilterPreset],
    plugins: [IdToNodeIdPlugin],
    disablePlugins: ['PgIndexBehaviorsPlugin'],
    pgServices: [makePgService({ 
        connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
        schemas: ["public"],
    })],
    gather: {
        pgJwtTypes: "public.jwt_token",
    },
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
          return {
            pgSettings: {
              role: "anonymous",
              // JWT may override the role:
              ...args.contextValue?.pgSettings,
            },
          };
        },
    },
};

// Create configuration for app database
function createAppPreset(options){
    return {
        extends: [PostGraphileAmberPreset, PgLazyJWTPreset, PostGraphileConnectionFilterPreset],
        plugins: [IdToNodeIdPlugin],
        disablePlugins: ['PgIndexBehaviorsPlugin'],
        pgServices: [makePgService({ 
            //connectionString: `postgres://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`,
            //connection must be done with super user because database user does not have to switch to role of secondary admin that are not db owner
            connectionString: `postgres://${options.superuser}:${options.superpassword}@${options.host}:${options.port}/${options.database}`,
            superuserConnectionString: `postgres://${options.superuser}:${options.superpassword}@${options.host}:${options.port}/${options.database}`,
            schemas: options.schemas??["public", "openbamz"],
        })],
        gather: {
            pgJwtTypes: "public.jwt_token",
        },
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
            pgJwtSecret: process.env.JWT_SECRET,
            //recommended options to avoid expensive filter operation
            connectionFilterComputedColumns: false,
            connectionFilterSetofFunctions: false,
            connectionFilterArrays: false,
        },
        grafast: {
            context(requestContext, args) {
              return {
                pgSettings: {
                  role: "anonymous",
                  // JWT may override the role:
                  ...args.contextValue?.pgSettings,
                  //server side call can override the role
                  ...args.contextValue?.forceRole,
                },
              };
            },
        },
    };
}

module.exports.mainDbPreset = mainDbPreset;
module.exports.createAppPreset = createAppPreset;
