# Open BamZ documentation

## What is Open BamZ ?

Open BamZ is both an application runtime and a plugin manager.

User use Open BamZ to create application, they activate plugins and use them to write their application code.

The application is served using Open BamZ as well.

## Open BamZ structure

### Main database

The Open BamZ platform has a main database that will contains : 
 - the list of user account (in table `account`)
 - the list of application (in table `app`)

To create an application, you need an account. Then when you create the application from your account, your account become the owner of the application.

### Application structure

An application is composed of a database and a file directory.

The database is at least used to contains the list of plugins activated for this application (in `openbamz.plugins` table). The plugins can also use it to store some metadata if needed.

If the application need data storage, it can of course create table in its database to store data.

The file directory contains the code source of the application.
It is the **front-end** code only.

If you need to execute server side code, you can either : 
 - create function and trigger in database (using javascript through plv8 or classical PL/pgSQL if you wish)
 - create a custom plugin of your own

### PostGraphile

To access the database from the application, Open BamZ use PostGraphile to provide standard GraphQL server to the application

### Plugin

The Open BamZ core does not do anything more that what is described above : 
 - Handle account
 - Create/Delete application database/directory
 - Provide GraphQL for each application
 - Serves applications and inject plugins to them

The rest of the job is done by the plugins