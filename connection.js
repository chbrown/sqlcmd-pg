/*jslint node: true */
var pg = require('pg');
var util = require('util');
var Connection = require('sqlcmd/connection');
var QueryStream = require('./stream');

/** Connection#query(sql: string | pg.Query,
                     args: any[],
                     callback: (error: Error, rows: object[]))

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
Connection.prototype.query = function(sql, args, callback) {
  var self = this;
  this.emit('log', {level: 'info', format: 'Executing SQL "%s" with variables: %j', args: [sql, args]});
  pg.connect(this.options, function(err, client, done) {
    if (err) return callback(err);

    client.query(sql, args, function(err, result) {
      done();
      if (err) {
        self.emit('log', {level: 'error', format: 'Query error: %j', args: [err]});
        return callback(err);
      }
      else {
        self.emit('log', {level: 'debug', format: 'Query result: %j', args: [result]});
        return callback(null, result ? result.rows : null);
      }
    });
  });
};

/** Connection#queryStream(sql: string, args: any[])

Returns a readable Stream instance (a QueryStream from sqlcmd-pg/stream, to be
precise).
*/
Connection.prototype.queryStream = function(sql, args) {
  var self = this;
  this.emit('log', {level: 'info',
    format: 'Creating query stream with SQL "%s" and variables: %j', args: [sql, args]});

  var stream = new QueryStream(sql, args);

  pg.connect(this.options, function(err, client, done) {
    if (err) return stream.emit('error',  err);

    client.query(stream);
    stream.on('error', function(err) {
      done(err);
    });
    stream.on('end', function() {
      self.emit('log', {level: 'debug', format: 'Query stream ended'});
      done();
    });
  });

  return stream;
};

/** Connection#executeSQL(sql: string,
                          args: any[],
                          callback: (error: Error, rows: object[]))

Proxies directly to Connection#query (implemented in sqlcmd-pg)
*/
Connection.prototype.executeSQL = function(sql, args, callback) {
  this.query(sql, args, callback);
};

/** Connection#executeCommand(command: sqlcmd.Command,
                              callback: (error: Error, rows: object[]))

Process a sqlcmd.Command, which boils down to a single SQL string and its
parameters directly to Connection#query (implemented in sqlcmd-pg)

pg handles the overloading of optional args.
*/
Connection.prototype.executeCommand = function(command, callback) {
  var sql = command.toSQL();
  // this sql still has $variables in it, so we need to translate
  // them to the $1, $2, etc. that pg expects
  var args = [];
  // TODO: replace only $var that are not $$var (allow escaping by doubling)
  sql = sql.replace(/\$[A-Za-z0-9_.]+/g, function(match) {
    var name = match.slice(1);
    var value = command.parameters[name];
    if (value === undefined) {
      var message = 'Cannot execute command with incomplete parameters. "' + name + '" is missing.';
      message += ' sql = "' + sql + '" context = ' + util.inspect(command.parameters);
      throw new Error(message);
    }
    // Array#push returns the length of the array after insertion, which is the
    // 1-based index of the inserted item if we're pushing things in one at a time.
    var index = args.push(value);
    return '$' + index;
  });
  this.query(sql, args, callback);
};

/**
Call pg.connect() with this connection's options, and callback with a Client
from the pool. When you call doneCallback, the Client will be returned to the
pool, and the given outerCallback will be called with the same arguments.

outerCallback: (error: Error, ...args: any)
callback: (error: Error, client: pg.Client, doneCallback: (error: Error, ...args: any) => void);
*/
Connection.prototype.getClient = function(outerCallback, callback) {
  pg.connect(this.options, function(err, client, done) {
    callback(err, client, function(/* ...args */) {
      done();
      outerCallback.apply(null, arguments);
    });
  });
};

/** Connection#close()

Calls pg.end(), to disconnect all idle clients and dispose of all pools.
Does not stop or close in-progress clients.
*/
Connection.prototype.close = function() {
  pg.end();
};

// Database commands (uses same config except with 'postgres' database
Connection.prototype.postgresConnection = function() {
  // copy over options to new object that will be modified
  var options = {};
  for (var key in this.options) {
    options[key] = this.options[key];
  }
  options.database = 'postgres';
  var connection = new Connection(options);
  // percolate events on postgres connection up to calling connection
  var self = this;
  connection.on('log', function(ev) {
    self.emit('log', ev);
  });
  return connection;
};
/** Connection#databaseExists(callback: (error: Error, exists?: boolean))

Check if the database used by this connection exists. This method creates a new
connection to the special 'postgres' database using the same connection options,
but with a different database name.
*/
Connection.prototype.databaseExists = function(callback) {
  var postgres_db = this.postgresConnection();
  postgres_db.Select('pg_catalog.pg_database')
  .where('datname = ?', this.options.database)
  .execute(function(err, rows) {
    if (err) return callback(err);

    callback(null, rows.length > 0);
  });
};

// CREATE DATABASE and helper
Connection.prototype.createDatabase = function(callback) {
  /** Create the database used by this connection.

  We can't specify the database name as an argument, so we just put it into the string raw.
  This is unsafe, of course, but if you want to break your own computer, go for it.

      callback: function(error?: Error)
  */
  var postgres_db = this.postgresConnection();
  postgres_db.query('CREATE DATABASE "' + this.options.database + '"', [], callback);
};
Connection.prototype.createDatabaseIfNotExists = function(callback) {
  /** Check if the database exists.
  1. If it does not exist, create it.
  2. If it already exists, do nothing.

      callback: function(error: Error, created?: boolean)
  */
  var self = this;
  this.databaseExists(function(err, exists) {
    if (err) return callback(err);
    if (exists) return callback(null, false);

    self.createDatabase(function(err) {
      callback(err, err ? undefined : true);
    });
  });
};

// DROP DATABASE and helper
Connection.prototype.dropDatabase = function(callback) {
  /** Drop the database used by this connection.

  Vulnerable to injection via the database name!

      callback: function(error?: Error)
  */
  var postgres_db = this.postgresConnection();
  postgres_db.query('DROP DATABASE "' + this.options.database + '"', [], callback);
};
Connection.prototype.dropDatabaseIfExists = function(callback) {
  /** Check if the database exists.
  1. If it does not exist, do nothing.
  2. If it does exist, drop it.

      callback: function(error: Error, dropped?: boolean)
  */
  var self = this;
  this.databaseExists(function(err, exists) {
    if (err) return callback(err);
    if (!exists) return callback(null, false);

    self.dropDatabase(function(err) {
      callback(err, err ? undefined : true);
    });
  });
};

module.exports = Connection;
