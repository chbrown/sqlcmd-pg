import assert from 'assert';
import {describe, it, before, after} from 'mocha';

import {Connection} from '..';

var db = new Connection({database: 'sqlcmd_database'});

var persons = require('./examples/persons');

describe('persons example', () => {
  before(done => {
    persons.setup(db, done);
  });
  after(done => {
    db.close();
    persons.teardown(db, done);
  });

  it('should count 100 persons', done => {
    db.Select('person')
    .add('COUNT (id)')
    .execute((err, rows) => {
      if (err) return done(err);
      assert.equal(rows[0].count, 100);
      done();
    });
  });

  it('should find person named Brown aged 32', done => {
    db.Select('person')
    .whereEqual({name: 'Brown'})
    .execute((err, rows) => {
      if (err) return done(err);
      assert.equal(rows[0].age, 32);
      done();
    });
  });
});
