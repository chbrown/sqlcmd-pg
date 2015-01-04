/*jslint node: true */ /*globals describe, it, before, after */
var assert = require('assert');
var sqlcmd = new require('../');

var db = new sqlcmd.Connection({database: 'sqlcmd_database'});

describe('database create', function(t) {
  after(function(done) {
    db.dropDatabase(done);
  });

  it('should create the database without error', function(done) {
    db.createDatabase(done);
  });
});

describe('database test', function(t) {
  before(function(done) {
    db.createDatabase(done);
  });

  after(function(done) {
    db.dropDatabase(done);
  });

  it('should verify that the database exists after creation', function(done) {
    db.databaseExists(function(err, exists) {
      if (err) return done(err);
      assert(exists);
      done();
    });
  });
});

describe('database drop', function(t) {
  before(function(done) {
    db.createDatabase(done);
  });

  it('should drop the database without error', function(done) {
    db.dropDatabase(done);
  });
});
