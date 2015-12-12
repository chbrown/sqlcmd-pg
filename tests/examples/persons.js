import {eachSeries} from 'async';
import persons from './persons.json';

export function setup(db, callback) {
  db.createDatabase(err => {
    if (err) return callback(err);

    db.CreateTable('person')
    .add([
      'id SERIAL PRIMARY KEY',
      'name TEXT',
      'age INTEGER',
    ])
    .execute(err => {
      if (err) return callback(err);

      eachSeries(persons, (person, callback) => {
        db.Insert('person').set(person).execute(callback);
      }, callback);
    });
  });
}

export function teardown(db, callback) {
  db.dropDatabase(callback);
}
