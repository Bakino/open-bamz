-- Application database initialization script
-- It is run on each startup

CREATE EXTENSION  IF NOT EXISTS  plv8;
CREATE EXTENSION  IF NOT EXISTS  pgcrypto;
CREATE EXTENSION  IF NOT EXISTS  http;
CREATE EXTENSION IF NOT EXISTS citext;

-- custom data types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'email'
    ) THEN
        CREATE DOMAIN email AS citext
        CHECK (
            value ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'phone'
    ) THEN
        CREATE DOMAIN phone AS text
        CHECK (
            value ~ '^[+]*[(]{0,1}[0-9]{0,4}[)]{0,1}[-\s\./0-9]*$'
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'color'
    ) THEN
        CREATE DOMAIN color AS text
        CHECK (
            value ~ '^#(?:[0-9a-fA-F]{3}){1,2}$'
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'multiline'
    ) THEN
        CREATE DOMAIN multiline AS text;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'html'
    ) THEN
        CREATE DOMAIN html AS text;
    END IF;
END $$;

-- create schema openbamz
CREATE SCHEMA IF NOT EXISTS openbamz;

-- Create plugins table
CREATE TABLE IF NOT EXISTS openbamz.plugins (
    plugin_id varchar(128) primary key,
    create_time timestamp without time zone DEFAULT now(),
    "version" VARCHAR(128)
) ;

ALTER TABLE openbamz.plugins ADD COLUMN IF NOT EXISTS "version" VARCHAR(128) ;

-- trigger, on insert plugin, prepare the plugin
CREATE OR REPLACE FUNCTION openbamz.openbamz_plugin_insert() RETURNS TRIGGER AS
$$
    plv8.execute(`SELECT graphile_worker.add_job('addPlugin', json_build_object('plugin', '${NEW.plugin_id}'))`);
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER openbamz_plugin_insert
    AFTER INSERT
    ON openbamz.plugins FOR EACH ROW
    EXECUTE PROCEDURE openbamz.openbamz_plugin_insert();


-- trigger, on insert plugin, prepare the plugin
CREATE OR REPLACE FUNCTION openbamz.openbamz_plugin_remove() RETURNS TRIGGER AS
$$
    plv8.execute(`SELECT graphile_worker.add_job('removePlugin', json_build_object('plugin', '${OLD.plugin_id}'))`);
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER openbamz_plugin_remove
    AFTER DELETE
    ON openbamz.plugins FOR EACH ROW
    EXECUTE PROCEDURE openbamz.openbamz_plugin_remove();

-- transaction functions
DROP TYPE IF EXISTS openbamz.transaction_action_type CASCADE;
DROP TYPE IF EXISTS openbamz.transaction_record_type CASCADE;

CREATE TYPE openbamz.transaction_action_type AS ENUM ('insert', 'update', 'delete');

CREATE TYPE openbamz.transaction_record_type AS (
    action openbamz.transaction_action_type,
    table_name TEXT,
    id TEXT,
    record JSONB,
    key JSONB
);

-- run transaction actions
-- supports insert, update, delete
CREATE OR REPLACE function openbamz.run_transaction(
  records openbamz.transaction_record_type[]
)
returns openbamz.transaction_record_type[] as
$$
    const results = [] ;
    const resultById = {} ;
    for(let rec of records){
        // replace placeholder
        if(rec.record){
            for(let [k, v] of Object.entries(rec.record)){
                if(typeof v === 'string' && v.startsWith('${') && v.endsWith('}') ){
                    let [recId, column] = v.substring(2, v.length-1).split(".") ;
                    let record = resultById[recId] ;
                    if(record){
                        rec.record[k] = record[column] ;
                    }else{
                        rec.record[k] = null ;
                    }
                }
            }
        }
        if(rec.action === 'insert'){
            const sql = `INSERT INTO ${rec.table_name} (${Object.keys(rec.record).join(",")}) VALUES (${Object.keys(rec.record).map((k,i)=>'$'+(i+1)).join(",")}) RETURNING *` ;
            const params = Object.values(rec.record)
            try{
                const result = plv8.execute(sql, params);
                results.push({action: rec.action, table_name: rec.table_name, record: result[0], key: null, id: rec.id});
                resultById[rec.id] = result[0] ;
            }catch(err){
                throw `Error running ${sql} (params ${JSON.stringify(params)}) : ${err}`;
            }
        } else if(rec.action === 'update'){
            const updateFields = Object.keys(rec.record) ;
            const keyFields = Object.keys(rec.key) ;
            const sql = `UPDATE ${rec.table_name} SET ${updateFields.map((k,i)=>`${k} = ${"$"+(i+1)} `).join(",")} WHERE ${keyFields.map((k,i)=>`${k} = ${"$"+(i+updateFields.length+1)} `).join(" AND ")} RETURNING *`;
            const params = Object.values(rec.record).concat(Object.values(rec.key));
            try{
                const result = plv8.execute(sql, params);
                results.push({action: rec.action, table_name: rec.table_name, record: result, key: rec.key, id: rec.id});
                resultById[rec.id] = result[0] ;
            }catch(err){
                throw `Error running ${sql} (params ${JSON.stringify(params)}) : ${err}`;
            }
        } else if(rec.action === 'delete'){
            const keyFields = Object.keys(rec.key) ;
            const sql = `DELETE FROM ${rec.table_name} WHERE ${keyFields.map((k,i)=>`${k} = ${"$"+(i+1)} `).join(" AND ")} RETURNING *`;
            const params = Object.values(rec.key) ;
            try{
                const result = plv8.execute(sql, params);
                results.push({action: rec.action, table_name: rec.table_name, record: result, key: rec.key, id: rec.id});
                resultById[rec.id] = result[0] ;
            }catch(err){
                throw `Error running ${sql} (params ${JSON.stringify(params)}) : ${err}`;
            }
        }
    }
    return results;
$$
LANGUAGE "plv8" ;

-- list all tables and columns in the database
CREATE OR REPLACE function openbamz.list_schema_and_tables()
returns JSONB as
$$
    const results = plv8.execute(`SELECT 
        t.table_schema,
        t.table_name,
        c.column_name,
        CASE 
            WHEN type.typcategory = 'E' THEN 'enum'
            WHEN domain_type.typname IS NOT NULL THEN domain_type.typname
            ELSE c.data_type 
        END AS data_type,
        c.character_maximum_length,
        c.is_nullable,
        c.column_default,
        c.numeric_precision,
        c.numeric_scale,
        pgd.description AS description,
        CASE 
            WHEN type.typcategory = 'E' THEN
                (SELECT array_agg(enumlabel)
                FROM pg_catalog.pg_enum e
                WHERE e.enumtypid = type.oid)
            ELSE NULL
        END AS enum_values,
        (SELECT description 
            FROM pg_description d 
            WHERE d.objoid = type.oid
            AND d.objsubid = 0) AS type_description,
        pgtd.description AS table_description
    FROM information_schema.tables t
    JOIN information_schema.columns c 
        ON t.table_schema = c.table_schema 
        AND t.table_name = c.table_name
    LEFT JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = (SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name AND relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema))
        AND pgd.objsubid = c.ordinal_position
    LEFT JOIN pg_catalog.pg_type type 
        ON c.udt_name = type.typname
    LEFT JOIN pg_catalog.pg_type domain_type
        ON c.domain_name = domain_type.typname
    LEFT JOIN pg_catalog.pg_description pgtd
        ON pgtd.objoid = (SELECT oid FROM pg_catalog.pg_class WHERE relname = t.table_name AND relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = t.table_schema))
        AND pgtd.objsubid = 0
    WHERE t.table_schema NOT LIKE 'pg_%'
        AND t.table_schema NOT IN ('information_schema', 'graphile_worker')
    ORDER BY t.table_schema, t.table_name, c.ordinal_position`);

    const resultsFk = plv8.execute(`SELECT tc.constraint_name, tc.table_schema, tc.table_name, kc.column_name, ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name  FROM
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kc ON kc.table_name = tc.table_name AND kc.table_schema = tc.table_schema
        AND kc.constraint_name = tc.constraint_name
        JOIN information_schema.tables t ON tc.table_name = t.table_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
    WHERE 
        tc.constraint_type = 'FOREIGN KEY'
    ORDER BY ordinal_position`);
    let fkByCol = {} ;
    for(let r of resultsFk){
        const key = `${r.table_schema}_${r.table_name}_${r.column_name}` ;
        fkByCol[key] = r ;
    }

    const resultsPk = plv8.execute(`SELECT tc.constraint_name, tc.table_schema, tc.table_name, kc.column_name 
        FROM
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kc ON kc.table_name = tc.table_name AND kc.table_schema = tc.table_schema
        AND kc.constraint_name = tc.constraint_name
        JOIN information_schema.tables t ON tc.table_name = t.table_name
    WHERE 
        tc.constraint_type = 'PRIMARY KEY'
    ORDER BY ordinal_position`);
    let pkByCol = {} ;
    for(let r of resultsPk){
        const key = `${r.table_schema}_${r.table_name}_${r.column_name}` ;
        pkByCol[key] = r ;
    }

    let result = {} ;

    for(let r of results){
        if(!result[r.table_schema]){
            result[r.table_schema] = {schema: r.table_schema, tables: {}} ;
        }
        if(!result[r.table_schema].tables[r.table_name]){

            let tableDescription = r.table_description ;
            let tableOptions = {} ;
            if(tableDescription && tableDescription.startsWith && 
                tableDescription.startsWith("{")){
                try{
                    tableOptions = JSON.parse(tableDescription);
                    tableDescription = tableOptions.description ;
                }catch(e){
                    //malformatted JSON
                }
            }
            result[r.table_schema].tables[r.table_name] = {
                table_name: r.table_name, 
                description: tableDescription,
                options: tableOptions,
                columns: []
            } ;
        }
        const isPk = !!pkByCol[`${r.table_schema}_${r.table_name}_${r.column_name}`] ;
        let fk = fkByCol[`${r.table_schema}_${r.table_name}_${r.column_name}`] ;
        if(fk){
            fk = {
                constraint_name: fk.constraint_name,
                referenced_schema: fk.foreign_table_schema,
                referenced_table: fk.foreign_table_name,
                referenced_column: fk.foreign_column_name,
            }
        }
        result[r.table_schema].tables[r.table_name].columns.push({
            column_name: r.column_name,
            data_type: r.data_type,
            character_maximum_length: r.character_maximum_length,
            is_nullable: r.is_nullable==="YES",
            is_primary: isPk,
            reference: fk,
            column_default: r.column_default,
            numeric_precision: r.numeric_precision,
            numeric_scale: r.numeric_scale,
            description: r.description,
            enum_values: r.enum_values,
            type_description: r.type_description,
        });
    }

    return Object.values(result).map(r=>{ r.tables = Object.values(r.tables); return r ; });
$$
LANGUAGE "plv8" ;

DROP TYPE IF EXISTS public.jwt_token CASCADE;
create type public.jwt_token as (
  role varchar,
  exp integer,
  id uuid,
  login varchar,
  email varchar,
  user_data jsonb
);

GRANT USAGE ON SCHEMA openbamz TO anonymous;
GRANT EXECUTE ON FUNCTION openbamz.list_schema_and_tables TO anonymous;