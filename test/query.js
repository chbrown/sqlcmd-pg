/*jslint node: true */ /*globals describe, it, before, after */
var assert = require('assert');
var sqlcmd = new require('../');

var db = new sqlcmd.Connection({database: 'sqlcmd_database'});

var persons = require('./examples/persons');

describe('persons example', function(t) {
  before(function(done) {
    persons.setup(db, done);
  });
  after(function(done) {
    db.close();
    persons.teardown(db, done);
  });

  it('should count 100 persons', function(done) {
    db.Select('person')
    .add('COUNT (id)')
    .execute(function(err, rows) {
      if (err) return done(err);
      assert.equal(rows[0].count, 100);
      done();
    });
  });

  it('should find person named Brown aged 32', function(done) {
    db.Select('person')
    .whereEqual({name: 'Brown'})
    .execute(function(err, rows) {
      if (err) return done(err);
      assert.equal(rows[0].age, 32);
      done();
    });
  });
});
