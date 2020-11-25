import { EventEmitter } from 'events';
import Utils from './utils'


const main = async () => {
  try {


    const eventEmitter = new EventEmitter();
    const util = new Utils(eventEmitter, "Nico", "Lazarus");

    util.foo = 'hallo';

    console.log('get cache', await util.getCache());
    console.log('get cache', await util.getCache());


    eventEmitter.emit('new-data', {
      id: 'newContract'
    });

    console.log('get cache', await util.getCache());
    console.log('get cache', await util.getCache());


    console.log('get cache', await util.getFullName());
    console.log('get cache', await util.getFullName());
    util.firstName = 'Vor';
    console.log('get cache', await util.getFullName());
    util.lastName = 'Nach';
    console.log('get cache', await util.getFullName());
    console.log('get cache', await util.getFullName());


  } catch (error) {
    console.error(error);

  }
}


main();