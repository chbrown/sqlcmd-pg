/*jslint node: true */
var pg = require('pg');
var util = require('util-enhanced');
var Connection = require('sqlcmd/connection');

/** Run sql query on configured SQL connection

callback: function(Error | null, [Object] | null)
*/
Connection.prototype.query = function(sql, args, callback) {
  var self = this;
  var listened = this.emit('log', {level: 'info', format: 'Executing SQL "%s" with variables: %j', args: [sql, args]});
  pg.connect(this.options, function(err, client, done) {
    if (err) return callback ? callback(err) : err;

    client.query(sql, args, function(err, result) {
      if (err) {
        self.emit('log', {level: 'error', format: 'Query error: %j', args: [err]});
      }
      else {
        self.emit('log', {level: 'debug', format: 'Query result: %j', args: [result]});
      }
      done();
      if (callback) {
        callback(err, result ? result.rows : null);
      }
    });
  });
};

Connection.prototype.executeSQL = function(sql, callback) {
  this.query(sql, [], callback);
};

Connection.prototype.executeCommand = function(command, callback) {
  var sql = command.toSQL();
  // this sql still has $variables in it, so we need to flatten it
  var args = [];
  // TODO: replace only $var that are not $$var (allow escaping by doubling)
  sql = sql.replace(/\$\w+/g, function(match) {
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

// Database commands (uses same config except with 'postgres' database
Connection.prototype.postgresConnection = function(callback) {
  var self = this;
  var postgres_options = util.extend({}, this.options, {database: 'postgres'});
  var connection = new Connection(postgres_options);
  // percolate events on postgres connection up to calling connection
  connection.on('log', function(ev) {
    self.emit('log', ev);
  });
  return connection;
};

Connection.prototype.databaseExists = function(callback) {
  /** Check if the database used by this connection exists.
  This method connects to the special 'postgres' database with the same connection credentials.

      callback: function(err: Error, exists?: Boolean)
  */
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
