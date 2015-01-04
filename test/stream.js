/*jslint node: true */ /*globals describe, it, before, after */
var assert = require('assert');
var sqlcmd = new require('../');

var db = new sqlcmd.Connection({database: 'sqlcmd_database'});

var persons = require('./examples/persons');

describe('persons example (streaming)', function(t) {
  before(function(done) {
    persons.setup(db, done);
  });
  after(function(done) {
    db.close();
    persons.teardown(db, done);
  });

  it('should find person named Smith aged 47', function(done) {
    var ages = {};
    var stream = db.queryStream('SELECT * FROM person')
    .on('data', function(data) {
      ages[data.name] = data.age;
    }).on('error', function(error) {
      done(error);
    }).on('end', function() {
      assert.equal(ages.Smith, 47);
      done();
    });
  });
});
