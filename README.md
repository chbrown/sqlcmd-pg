[![Travis CI Build Status](https://travis-ci.org/chbrown/sqlcmd-pg.svg)](https://travis-ci.org/chbrown/sqlcmd-pg)

# sqlcmd-pg

[sqlcmd](https://github.com/chbrown/sqlcmd) for [PostgreSQL](http://www.postgresql.org/).

    npm install --save sqlcmd-pg

Or in your `package.json`:

    { ...
      "dependencies": {
        "sqlcmd-pg": "*",
        ...
      }
    }

Supports [PostgreSQL](http://www.postgresql.org/), via [pg](https://github.com/brianc/node-postgres).


## Configuration

With options object:

    var sqlcmd = require('sqlcmd-pg');

    var db = new sqlcmd.Connection({
      host: 'localhost',
      user: 'chbrown',
      database: 'friends',
    });

You can also use the connection string format:

    var db = new sqlcmd.Connection('postgres://chbrown@localhost/friends')

However, you must create the connection with the options object if you want to use any of the administrative helpers.


## Administrative helpers

The following helpers use the same connection options that were specified when creating the `db` connection, except it will connect to PostgreSQL's special `postgres` database instead of the database ("friends") we specified.

* `databaseExists` checks if the database exists by looking at the `pg_catalog.pg_database` table.
* `createDatabase` issues a `CREATE DATABASE ...` command.
* `dropDatabase` issues a `DROP DATABASE ...` command.

These commands are all unsafe; they are vulnerable to SQL injection via the database name.


## License

Copyright 2015 Christopher Brown. [MIT Licensed](http://opensource.org/licenses/MIT).
