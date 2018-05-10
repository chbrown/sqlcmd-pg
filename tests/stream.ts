import * as assert from 'assert';
import 'mocha';

import {Connection} from '..';

const db = new Connection({database: 'sqlcmd_database'});

const persons = require('./examples/persons');

describe('persons example (streaming)', () => {
  before(done => {
    persons.setup(db, done);
  });
  after(done => {
    db.close();
    persons.teardown(db, done);
  });

  it('should find person named Smith aged 47', done => {
    const ages: any = {};
    db.queryStream('SELECT * FROM person', [])
    .on('data', (data: any) => {
      ages[data.name] = data.age;
    }).on('error', (error) => {
      done(error);
    }).on('end', () => {
      assert.equal(ages.Smith, 47);
      done();
    });
  });
});
