-- This script create the main database structure
-- The main database contains the list of applications and users accounts


----- activate extensions ------
--------------------------------

-- PLv8 extension, to write function in javascript
CREATE EXTENSION  IF NOT EXISTS  plv8;

-- PG CRYPTO  extension
CREATE EXTENSION  IF NOT EXISTS  pgcrypto;


----- schemas  ------
---------------------

-- create schema private
CREATE SCHEMA IF NOT EXISTS private;


----- account management -------
--------------------------------

-- Create account table
CREATE TABLE IF NOT EXISTS private.account (
    _id uuid primary key DEFAULT gen_random_uuid(),
    create_time timestamp without time zone DEFAULT now(),
    email varchar(512) UNIQUE,
    name varchar(128),
    role varchar(128),
    password varchar(512),
    password_hash varchar(512)
) ;

-- trigger on create account, create the database user and crypt login password
CREATE OR REPLACE FUNCTION account_create_user() RETURNS TRIGGER AS
$$
    //generate the password for database user
    let result = plv8.execute(`SELECT gen_random_uuid() as uuidpass`);
    plv8.execute(`CREATE USER "${NEW._id}"  WITH PASSWORD '${result[0].uuidpass}'`);
    let dbpass = result[0].uuidpass ;

    //grant the role to the database user
    plv8.execute(`GRANT "${NEW.role}" TO "${NEW._id}"`)

    //crypt the password
    result = plv8.execute(`SELECT crypt($1, gen_salt('md5')) as crypted`, [NEW.password]);
    NEW.password_hash = result[0].crypted ;
    NEW.password = dbpass ;

    return NEW;
$$
LANGUAGE "plv8";

CREATE OR REPLACE TRIGGER account_create_user
    BEFORE INSERT
    ON private.account FOR EACH ROW
    EXECUTE PROCEDURE account_create_user();


-- trigger on delete account, drop the database user
CREATE OR REPLACE FUNCTION account_drop_user() RETURNS TRIGGER AS
$$
    plv8.execute(`DROP USER "${OLD._id}"`);
$$
LANGUAGE "plv8";

CREATE OR REPLACE TRIGGER account_drop_user
    AFTER DELETE
    ON private.account FOR EACH ROW
    EXECUTE PROCEDURE account_drop_user();


------- JWT auth system --------
--------------------------------

-- Prepare JWT token type
DROP TYPE IF EXISTS public.jwt_token CASCADE;
create type public.jwt_token as (
  role varchar,
  exp integer,
  id uuid,
  login varchar,
  email varchar
);

-- function authenticate
create or replace function public.authenticate(
  email text,
  password text
)
returns public.jwt_token
as $$
declare
  account private.account;
begin
  select a.* into account
    from private.account as a
    where a.email = authenticate.email;

  if account.password_hash = crypt(password, account.password_hash) then
    return (
      account._id,
      extract(epoch from now() + interval '7 days'),
      account._id,
      account.email,
      account.email
    )::public.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

--refresh JWT token (get account from current token and create a new one)
create or replace function public.refresh_auth()
returns public.jwt_token
as $$
declare
  account private.account;
begin

  --RAISE WARNING 'ROLE ????(%)', current_setting('role', true);

  select a.* into account
    from private.account as a
    where a._id::varchar = current_setting('role', true)::varchar;


  --RAISE WARNING 'ACCOUNT ????(%)', account._id;

  if account._id is not null then
    return (
      account._id,
      extract(epoch from now() + interval '7 days'),
      account._id,
      account.email,
      account.email
    )::public.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

-- function create account
create or replace function public.read_account()
returns private.account
as $$
DECLARE
   result private.account;
begin
  select a.* into result
    from private.account as a
    where a._id::varchar = current_setting('role', true)::varchar ;

  result.password = '';
  result.password_hash = '';
  return result;

end;
$$ language plpgsql strict security definer;

-- function create account
DROP FUNCTION IF EXISTS create_account(text,text,text);
create or replace function public.create_account(
  user_email text,
  name text,
  password text
)
returns private.account
as $$
DECLARE
   result private.account;
   existing_user_count integer;
begin
  -- Check if user already exists
  select count(*) into existing_user_count from private.account where private.account.email = user_email;

  if existing_user_count > 0 then
    raise exception 'ALREADY_EXISTS';
  end if;

  insert into private.account(email, name, password, role) values (user_email, name, password, 'normal_user') returning * INTO result;
  result.password = '';
  result.password_hash = '';
  return result;
end;
$$ language plpgsql strict security definer;

DROP FUNCTION  IF EXISTS check_account_exists(text);
create or replace function public.check_account_exists(
  user_email text
)
returns boolean
as $$
DECLARE
   existing_user_count integer;
begin
  -- Check if user already exists
  select count(*) into existing_user_count from private.account where private.account.email = user_email;

  if existing_user_count > 0 then
    return true;
  end if;

  return false;
end;
$$ language plpgsql strict security definer;

create or replace function public.delete_account(
  email text
)
returns void as
$$

    let result = plv8.execute(`SELECT * FROM private.account WHERE email = $1`, [email]);
    let account = result[0]
    if(!account){
      throw "Unkown account "+email ;
    }
    let resultRole = plv8.execute(`SELECT current_setting('role') as role`);
    if(resultRole[0] !== account._id){
      throw "Only owner of account can delete it" ;
    }
    
    plv8.execute(`DELETE FROM private.account WHERE _id = $1`, [account._id]);

    return NEW;
$$
LANGUAGE "plv8" SECURITY DEFINER;


------- Application management --------
---------------------------------------

CREATE TABLE IF NOT EXISTS public.app(
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64),
  owner UUID,
  hosts JSONB NOT NULL DEFAULT '[]'::jsonb, -- [ { hostname }, ... ]
  admins JSONB NOT NULL DEFAULT '[]'::jsonb, -- [ { _id, email, name }, ... ]
  FOREIGN KEY(owner) 
       REFERENCES private.account(_id)
       ON DELETE CASCADE
) ;

CREATE INDEX IF NOT EXISTS idx_app_hosts ON public.app USING gin (hosts);

-- check user right
alter table public.app enable row level security;

DROP POLICY  IF EXISTS  select_app ON public.app;
DROP POLICY  IF EXISTS  update_app ON public.app;
DROP POLICY  IF EXISTS  delete_app ON public.app;
DROP POLICY  IF EXISTS  insert_app ON public.app;



-- owner and admins can read the record
create policy select_app on public.app for select to normal_user
  using (owner::varchar = nullif(current_setting('role', true), '') OR admins @> ('[{"_id":"'||nullif(current_setting('role', true), '')||'"}]')::jsonb);
-- only owner can update
create policy update_app on public.app for update to normal_user
  using (owner::varchar = nullif(current_setting('role', true), ''));
-- only owner can delete
create policy delete_app on public.app for delete to normal_user
  using (owner::varchar = nullif(current_setting('role', true), ''));
create policy insert_app on public.app for insert to normal_user
  with check (true); -- no check because the trigger force the owner to current user


create or replace function public.create_application(
  name text
)
returns public.app
as $$
  let inc = 0 ;
  let baseId = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]/, "") ;
  let generatedId = baseId ;
  while(plv8.execute(`SELECT * FROM public.app WHERE code = $1`, [generatedId]).length > 0){
      generatedId = baseId+"_"+(++inc) ;
  }
  const code = generatedId ;

  const result = plv8.execute(`INSERT INTO public.app(code, name) VALUES ($1, $2) RETURNING *`, [code, name]);
  return result[0];
end;
$$ LANGUAGE "plv8" SECURITY DEFINER;


-- trigger, on create application, create the database
CREATE OR REPLACE FUNCTION app_create_database() RETURNS TRIGGER AS
$$

    if(!NEW.code){
        let inc = 0 ;
        let baseId = NEW.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]/, "") ;
        let generatedId = baseId ;
        while(plv8.execute(`SELECT * FROM public.app WHERE code = $1`, [generatedId]).length > 0){
            generatedId = baseId+"_"+(++inc) ;
        }
        NEW.code = generatedId ;
    }

    const reserved = ["__backups", "$bamz", "bamz", "app", "backup", "api", "creator", "restore", "run", "stats", "metabase", "openbamz", "_openbamz"] ;
    if(reserved.indexOf(NEW.code) !== -1){
        throw NEW.code+" is reserved"
    }

    let result = plv8.execute(`SELECT current_setting('role') as role`);
    NEW.owner = result[0].role ; // force owner to current user

    plv8.execute(`SELECT graphile_worker.add_job('createDatabase', json_build_object('database', '${NEW.code}'))`);

    return NEW;
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER app_create_database
    BEFORE INSERT
    ON app FOR EACH ROW
    EXECUTE PROCEDURE app_create_database();


-- trigger, on create or update application, update admins ids
CREATE OR REPLACE FUNCTION app_update_admins() RETURNS TRIGGER AS
$$

    for(let admin of NEW.admins){
      let results = plv8.execute("SELECT _id, name FROM private.account WHERE email = $1", [admin.email]) ;
      if(results[0]){
        admin._id = results[0]._id;
        admin.name = results[0].name;
      }else{
        delete admin._id;
      }
    }

    NEW.admins = NEW.admins.filter(a=>a._id) ;
    

    return NEW;
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER app_update_admins
    BEFORE INSERT OR UPDATE
    ON app FOR EACH ROW
    EXECUTE PROCEDURE app_update_admins();


-- trigger, on create or update application, update hostname cache
CREATE OR REPLACE FUNCTION app_update_hostname_cache() RETURNS TRIGGER AS
$$
    plv8.execute(`SELECT graphile_worker.add_job('updateHostnameCache', $1)`, [{previousHosts: OLD ? OLD.hosts : null, newHosts: NEW.hosts, database: NEW.code}]);
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER app_update_admins
    AFTER INSERT OR UPDATE
    ON app FOR EACH ROW
    EXECUTE PROCEDURE app_update_admins();



-- trigger, on create or update application, update permissions
CREATE OR REPLACE FUNCTION app_update_permissions() RETURNS TRIGGER AS
$$

    let previousAdminIds = [];
    if(OLD){
      previousAdminIds = OLD.admins.map(a=>a._id) ;
    }
    let newAdminsIds = NEW.admins.map(a=>a._id) ;

    let adminToRemove = previousAdminIds.filter(a=>!newAdminsIds.includes(a));
    let adminToAdd = newAdminsIds.filter(a=>!previousAdminIds.includes(a));

    let dbRole = NEW.code+"_admin";
    for(let admin of adminToRemove){
      plv8.execute(`REVOKE "${dbRole}" FROM "${admin}"`);
    }
    for(let admin of adminToAdd){
      plv8.execute(`GRANT "${dbRole}" TO "${admin}"`);
    }

    return NEW;
$$
LANGUAGE "plv8" SECURITY DEFINER;

CREATE OR REPLACE TRIGGER app_update_permissions
    AFTER INSERT OR UPDATE
    ON app FOR EACH ROW
    EXECUTE PROCEDURE app_update_permissions();


-- trigger, on delete application, delete the database
CREATE OR REPLACE FUNCTION app_drop_database() RETURNS TRIGGER AS
$$
    plv8.execute(`SELECT graphile_worker.add_job('dropDatabase', json_build_object('database', '${OLD.code}'))`);

    plv8.elog(NOTICE, "database deleted");
$$
LANGUAGE "plv8";

CREATE OR REPLACE TRIGGER app_drop_database
    AFTER DELETE
    ON app FOR EACH ROW
    EXECUTE PROCEDURE app_drop_database();



