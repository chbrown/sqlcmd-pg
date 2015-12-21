import * as pg from 'pg';
import {Command, Connection as BaseConnection} from 'sqlcmd';
import QueryStream from './stream';

export class Connection extends BaseConnection {
  /**
  Run sql query or pg.Query instance on configured SQL connection with given
  parameters.

  sql
    SQL query (any PostgreSQL command) or pg.Query object (determined by whether
    sql.submit is a function)
  args
    parameters to accompany the SQL command
  callback
    function to call when the query has completed, or if it encountered an error

  */
  query(sql: string | pg.Query, args: any[], callback: (error: Error, rows?: any[]) => void) {
    this.emit('log', {level: 'info', format: 'Executing SQL "%s" with variables: %j', args: [sql, args]});
    pg.connect(this.options, (err, client, done) => {
      if (err) return callback(err);

      // pg.d.ts is wrong about client.query
      client.query(<any>sql, args, (err, result) => {
        done();
        if (err) {
          this.emit('log', {level: 'error', format: 'Query error: %j', args: [err]});
          return callback(err);
        }
        else {
          this.emit('log', {level: 'debug', format: 'Query result: %j', args: [result]});
          return callback(null, result ? result.rows : null);
        }
      });
    });
  }

  /**
  Returns a readable Stream instance (a QueryStream from sqlcmd-pg/stream, to be
  precise).
  */
  queryStream(sql: string, args: any[]) {
    this.emit('log', {level: 'info',
      format: 'Creating query stream with SQL "%s" and variables: %j', args: [sql, args]});

    var stream = new QueryStream(sql, args);

    pg.connect(this.options, (err, client, done: (error?: Error) => void) => {
      if (err) return stream.emit('error',  err);

      client.query(stream);
      stream.on('error', (err) => {
        done(err);
      });
      stream.on('end', () => {
        this.emit('log', {level: 'debug', format: 'Query stream ended'});
        done();
      });
    });

    return stream;
  }

  /**
  Proxies directly to Connection#query (implemented in sqlcmd-pg)
  */
  executeSQL(sql: string, args: any[], callback: (error: Error, rows?: any[]) => void) {
    this.query(sql, args, callback);
  }

  /**
  Process a sqlcmd.Command, which boils down to a single SQL string and its
  parameters directly to Connection#query (implemented in sqlcmd-pg)

  pg handles the overloading of optional args.
  */
  executeCommand<R>(command: Command<R>,
                    callback: (error: Error, result?: R) => void) {
    var sql = command.toSQL();
    // this sql still has $variables in it, so we need to translate
    // them to the $1, $2, etc. that pg expects
    var args = [];
    // TODO: replace only $var that are not $$var (allow escaping by doubling)
    sql = sql.replace(/\$[A-Za-z0-9_.]+/g, (match) => {
      var name = match.slice(1);
      var value = command.parameters[name];
      if (value === undefined) {
        throw new Error(`Cannot execute command with incomplete parameters. "${name}" is missing.` +
          ` sql = "${sql}" context = ${JSON.stringify(command.parameters)}`);
      }
      // Array#push returns the length of the array after insertion, which is the
      // 1-based index of the inserted item if we're pushing things in one at a time.
      var index = args.push(value);
      return '$' + index;
    });
    this.query(sql, args, <any>callback);
  }

  /**
  Call pg.connect() with this connection's options, and callback with a Client
  from the pool. When you call doneCallback, the Client will be returned to the
  pool, and the given outerCallback will be called with the same arguments.
  */
  getClient(outerCallback: (error: Error, ...args: any[]) => void,
            callback: (error: Error, client: pg.Client, doneCallback: (error: Error, ...args: any[]) => void) => void) {
    pg.connect(this.options, (err, client, done) => {
      callback(err, client, function(/* ...args */) {
        done();
        outerCallback.apply(null, arguments);
      });
    });
  }

  /**
  Calls pg.end(), to disconnect all idle clients and dispose of all pools.
  Does not stop or close in-progress clients.
  */
  close() {
    pg.end();
  }

  // Database commands (uses same config except with 'postgres' database

  postgresConnection() {
    // copy over options to new object that will be modified
    var options: pg.ConnectionConfig = {};
    for (var key in this.options) {
      options[key] = this.options[key];
    }
    options.database = 'postgres';
    var connection = new Connection(options);
    // percolate events on postgres connection up to calling connection
    connection.on('log', ev => this.emit('log', ev));
    return connection;
  }

  /**
  Check if the database used by this connection exists. This method creates a new
  connection to the special 'postgres' database using the same connection options,
  but with a different database name.
  */
  databaseExists(callback: (error: Error, exists?: boolean) => void) {
    var postgres_db = this.postgresConnection();
    postgres_db.Select('pg_catalog.pg_database')
    .whereEqual({datname: this.options.database})
    .execute((err, rows) => {
      if (err) return callback(err);

      callback(null, rows.length > 0);
    });
  }

  /** Create the database used by this connection.

  We can't specify the database name as an argument, so we just put it into the string raw.
  This is unsafe, of course, but if you want to break your own computer, go for it.
  */
  createDatabase(callback: (error?: Error) => void) {
    var postgres_db = this.postgresConnection();
    postgres_db.query(`CREATE DATABASE "${this.options.database}"`, [], callback);
  }

  /** Check if the database exists.
  1. If it does not exist, create it.
  2. If it already exists, do nothing.
  */
  createDatabaseIfNotExists(callback: (error: Error, created?: boolean) => void) {
    this.databaseExists((err, exists) => {
      if (err) return callback(err);
      if (exists) return callback(null, false);

      this.createDatabase(err => callback(err, err ? undefined : true));
    });
  }

  /** Drop the database used by this connection.

  Vulnerable to injection via the database name!
  */
  dropDatabase(callback: (error?: Error) => void) {
    var postgres_db = this.postgresConnection();
    postgres_db.query(`DROP DATABASE "${this.options.database}"`, [], callback);
  }

  /** Check if the database exists.
  1. If it does not exist, do nothing.
  2. If it does exist, drop it.
  */
  dropDatabaseIfExists(callback: (error: Error, dropped?: boolean) => void) {
    this.databaseExists((err, exists) => {
      if (err) return callback(err);
      if (!exists) return callback(null, false);

      this.dropDatabase(err => callback(err, err ? undefined : true));
    });
  };
}
