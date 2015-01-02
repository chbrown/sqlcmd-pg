/*jslint node: true */ /*globals describe, it, before, after */
var assert = require('assert');
var sqlcmd = new require('../');

var database = 'sqlcmd_database';
var connection = new sqlcmd.Connection({database: database});
// console.error('creating database named %s; if tests fail, you may need to drop it manually', database);

describe('database create', function(t) {
  after(function(done) {
    connection.dropDatabase(done);
  });

  it('should create the database without error', function(done) {
    connection.createDatabase(done);
  });
});

describe('database test', function(t) {
  before(function(done) {
    connection.createDatabase(done);
  });

  after(function(done) {
    connection.dropDatabase(done);
  });

  it('should verify that the database exists', function(done) {
    connection.databaseExists(function(err, exists) {
      if (err) return done(err);
      assert(exists, 'the database should be visible after creation');
      done();
    });
  });
});

describe('database drop', function(t) {
  before(function(done) {
    connection.createDatabase(done);
  });

  it('should drop the database without error', function(done) {
    connection.dropDatabase(done);
  });
});
