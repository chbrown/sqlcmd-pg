import * as stream from 'stream';

var Result = require('pg/lib/result');
var prepareValue = require('pg/lib/utils').prepareValue;

export interface FieldType {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: string; // 'text' | 'binary'
}

export interface QueryStreamOptions {
  highWaterMark?: number;
  portal?: string;
}

/**
Create a stream.Readable that will emit rows from a postgres query

@param {text} SQL parameterized query
@param {values} Raw parameters to the SQL query
@param {options.highWaterMark} Number of rows to buffer; defaults to 16384
@param {options.portal} The name of this "portal" to the PostgreSQL connection; defaults to ''

Example:

    var query_stream = new QueryStream('SELECT * FROM users', [])
    .on('data', function(data) {
      console.log(data);
    })
    .on('error', function(err) {
      console.error(err);
    });
    client.query(query_stream);


Since QueryStream has a #submit() function, the client will consider it a
standard pg.Query, and call it with the current connection, like so:

    query_stream.submit(client.connection)

Inspired by https://github.com/brianc/node-pg-cursor/blob/master/index.js
and https://github.com/brianc/node-pg-query-stream/blob/master/index.js, along
with a lot of the Node.js standard library's stream.Readable source code.
*/
export default class QueryStream extends stream.Readable {
  values: any[];
  connection: any;
  _result: any;
  constructor(public text: string,
              values: any[],
              public options: QueryStreamOptions = {highWaterMark: 16384, portal: ''}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark,
    });
    this.values = Array.isArray(values) ? values.map(prepareValue) : null;
    this._result = new Result();
  }

  /**
  _read is the primary way to implement a readable stream, but since we want to
  work closely with the PostgresSQL connection, we also use a few other hacks
  that go beyond _read (e.g., modifying this._readableState.reading directly).

  @param {size} By default, this is the highWaterMark option (defaults to 16384).
    The stream.Readable implementation may increase the highWaterMark value.
    And the stream.Readable API says this size is just a suggestion.
    We ask for `size` rows below.

  The query is ready to go when QueryStream#connection is set. Otherwise, we have
  to wait, and set this._readableState.reading to false to tell the consuming
  stream that it's been fed all available data (i.e., none).
  */
  _read(size: number) {
    if (this.connection) {
      this.connection.execute({rows: size, portal: this.options.portal}, true);
      this.connection.flush();
    }
    else {
      this['_readableState'].reading = false;
    }
  }

  /** QueryStream#submit(connection: pg.Connection)

  The pg.Client will call QueryStream#submit(connection) when the connection is
  available to run this query. The client will not process further queries on this
  client in the client pool until the connection emits 'readyForQuery',

  @param {connect} A pg.Connection, but the pg.d.ts does not expose such a type.
  */
  submit(connection: any) {
    this.connection = connection;
    this.connection.parse({text: this.text}, true);
    this.connection.bind({values: this.values, portal: this.options.portal}, true);
    this.connection.describe({type: 'P', name: this.options.portal}, true);
    this.connection.flush();

    // if _read was called before the connection was available (quite likely),
    // it will have halted and be awaiting data before it calls _read again.
    // calling read(0) will tell the stream consumer to try reading it again.
    this.read(0);
  }

  close() {
    this.connection.close({type: 'P'});
    this.connection.sync();
  }

  /** Emultating a pg.Query requires implementing several specific handlers,
  beyond QueryStream#submit(), since these are called by the pg.Client processing
  the query without checking if they exist.

  * handleRowDescription
  * handleDataRow
  * handlePortalSuspended
  * handleCommandComplete
  * handleReadyForQuery

  It will also call the following, but only for the unusual queries that emit
  copyInResponse and copyData events:

  * handleCopyInResponse
  * handleCopyData
  */

  /**
  As with all the handleX handlers, the connection emits the original event, which
  the pg.Client listens for and then calls the appropriate handler on the active
  Query instance.

  The rowDescription event corresponds to a "T" header, and is called once (?) per
  query.
  */
  handleRowDescription(msg: {fieldCount: number, fields: FieldType[]}) {
    this._result.addFields(msg.fields);
  }

  /**
  handleDataRow is called once for every row encountered by a query.
  It is trigged by the "D" header.
  */
  handleDataRow(msg: {name: string, // 'dataRow'
                      length: number,
                      fieldCount: number,
                      fields: Buffer[]}) {
    var row = this._result.parseRow(msg.fields);
    this['_readableState'].buffer.push(row);
    this['_readableState'].length++;
  }

  /**
  handleCommandComplete is called when the connection encounters a "C" header.
  */
  handleCommandComplete(msg: {text: string}) {
    // tell the connection we're done, by sending it an "S" header
    this.connection.sync();
  }

  /**
  handlePortalSuspended is called when the connection encounters an "s" header.

  I'm not sure exactly when this is called.
  */
  handlePortalSuspended() {
    // Emulate successful .push() by reaching into the _readableState,
    // and marking reading = false ...
    this['_readableState'].reading = false;
    // so that when the readable stream next runs through its flush routine (as
    // with read(0)), it will send all rows in its buffer to its consumer(s).
    this.read(0);
  }

  /**
  This handler is called by the pg.Client, on that client's current "activeQuery",
  a Query instance, whenever the connection emits a "readyForQuery" event
  (which is triggered when the connection reads a "Z" header).
  */
  handleReadyForQuery() {
    // tell the stream we've reached the end (this also triggers an "end" event
    // on this QueryStream)
    this.push(null);
    // tell the underlying
    this.connection.end();
  }

  /**
  handleError is called when the connection emits an 'error' event, or ends.
  The client removes the query from its queue, but doesn't do any other cleanup.
  The query is responsible for resetting the connection so that the

  This handler is called by the pg.Client, on that client's current "activeQuery",
  a Query instance, whenever the connection emits a "readyForQuery" event
  (which is triggered when the connection reads a "Z" header).
  */
  handleError(err, connection) {
    this.emit('error', err);
    // tell the connection we're done, by sending it an "S" header
    this.connection.sync();
  }
}
