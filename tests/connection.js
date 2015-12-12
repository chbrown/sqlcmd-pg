import assert from 'assert';
import {describe, it, before, after} from 'mocha';

import {Connection} from '..';

var db = new Connection({database: 'sqlcmd_database'});

describe('database create', () => {
  after(done => {
    db.dropDatabase(done);
  });

  it('should create the database without error', done => {
    db.createDatabase(done);
  });
});

describe('database test', () => {
  before(done => {
    db.createDatabase(done);
  });

  after(done => {
    db.dropDatabase(done);
  });

  it('should verify that the database exists after creation', done => {
    db.databaseExists(function(err, exists) {
      if (err) return done(err);
      assert(exists);
      done();
    });
  });
});

describe('database drop', () => {
  before(done => {
    db.createDatabase(done);
  });

  it('should drop the database without error', done => {
    db.dropDatabase(done);
  });
});
