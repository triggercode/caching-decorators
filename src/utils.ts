import { EventEmitter } from 'events';
import { cache, tracked } from './decorators';

export default class Utils {
  public foo: any;
  @tracked public data: any = "Foo";
  @tracked public firstName: any;
  @tracked public lastName: any;

  constructor(eventEmitter: EventEmitter, firstName: string, lastName: string) {
    this.foo = 'bar';
    this.firstName = firstName;
    this.lastName = lastName;
    eventEmitter.on('new-data', (data) => {
      this.data = data;
    });
  }

  @cache("data")
  async getCache() {
    console.log('triggered');
    return this.data;
  }

  @cache("firstName", "lastName", "getCache")
  async getFullName() {
    console.log('no cache use');

    return `${this.firstName} ${this.lastName}`
  }

  get hasData() {
    return this.data;
  }
}