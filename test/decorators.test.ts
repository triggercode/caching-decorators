// tslint: max-classes-per-file
import assert from 'assert';
import crypto from 'crypto';
import { spy } from 'sinon';
import { runInThisContext } from 'vm';
import { cache, tracked } from '../src/index';

function hashString(algorithm: string, input: string) {
  return crypto.createHash(algorithm).update(input).digest('hex');
}

const concatInputsSpy = spy();
const hashInputsSpy = spy();

class DecoratorsTest {
  @tracked public input1: string = '';
  @tracked public input2: string = '';

  @tracked public hashAlgorithm = 'md5';

  constructor(input1: string, input2: string) {
    this.input1 = input1;
    this.input2 = input2;
  }

  @cache('input1', 'input2')
  public async concatInputs() {
    concatInputsSpy();
    return this.input1.concat(this.input2);
  }

  @cache('concatInputs', 'hashAlgorithm')
  public async hashInputs() {
    hashInputsSpy();
    return crypto.createHash(this.hashAlgorithm).update(await this.concatInputs()).digest('hex');
  }
}

describe('the \'decorators\' test', () => {

  afterEach(() => {
    concatInputsSpy.resetHistory();
  });

  it('should cache values if no tracked property changes and should invalidate cache if a property changes', async () => {
    const decoratorsTest = new DecoratorsTest('input1', 'input2');

    const res = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.strictEqual(res, 'input1input2');

    // assure the cache is hit
    const res2 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledOnce); // still only called once as cached
    assert.strictEqual(res2, 'input1input2');

    // assure that changing the input invalidates the cache
    decoratorsTest.input1 = 'new';
    const res3 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledTwice); // called twice as cache was dirty
    assert.strictEqual(res3, 'newinput2');

    // assure that even after invalidating the cache hits again
    const res4 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledTwice); // still called twice as cached
    assert.strictEqual(res4, 'newinput2');
  });

  it('should invalidate cache if it depends on other cache and the other cache is invalidated', async () => {
    const decoratorsTest = new DecoratorsTest('input1', 'input2');

    // assure the concat cache is NOT hit
    const concatVals = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.strictEqual(concatVals, 'input1input2');

    // assure concat cache is hit
    // assure the hash cache NOT is hit
    const res = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.ok(hashInputsSpy.calledOnce);
    assert.strictEqual(res, hashString('md5', 'input1input2'));

    // assure concat cache is hit
    // assure the hash cache is hit
    const res2 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.ok(hashInputsSpy.calledOnce);
    assert.strictEqual(res2, hashString('md5', 'input1input2'));

    // assure concat cache is hit
    // assure chaning the hashAlgorithm is invalidating the hash cache
    decoratorsTest.hashAlgorithm = 'sha256';
    const res3 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.ok(hashInputsSpy.calledTwice);
    assert.strictEqual(res3, hashString('sha256', 'input1input2'));

    // assure concat cache is hit
    // assure the hash cache is hit
    const res4 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.ok(hashInputsSpy.calledTwice);
    assert.strictEqual(res4, hashString('sha256', 'input1input2'));

    // assure concat cache is invalidated because input1 is changed
    // assure the hash cache is invalidated because the concat cache is invalidated
    decoratorsTest.input1 = 'new';
    const res5 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledTwice);
    assert.ok(hashInputsSpy.calledThrice);
    assert.strictEqual(res5, hashString('sha256', 'newinput2'));
  });

  describe('error tests', () => {
    it('should throw error on invalid property descriptor value', () => {
      let hasError = true;
      try {
        // tslint:disable-next-line: max-classes-per-file
        class Failure {
          @cache()
          get value(): any {
            return 'something';
          }
        }
        const fail = new Failure();
        assert.ok(!fail);
        hasError = false;
      } catch (error) {
        assert.ok(error);
      }
      assert.ok(hasError);
    });

    it('Should also possible to read untracked variables in cache function', async () => {
      // tslint:disable-next-line: max-classes-per-file
      class Tester {
        @tracked trackedVar = 'one';
        notTrackedVar = 'two';

        @cache('trackedVar')
        async concat() {
          return this.trackedVar + this.notTrackedVar;
        }
      }

      const test = new Tester();

      assert.strictEqual(await test.concat(), 'onetwo');
    });



  });

  describe('multible instance tests', () => {
    it('same \'@tracked\' properties of diffrent instances should not infuence each other values', async () => {
      class Tester {
        @tracked number;
      }

      const a = new Tester();
      a.number = 0;
      const b = new Tester();
      b.number = 0;

      assert.strictEqual(b.number, 0);
      assert.strictEqual(a.number, 0);

      a.number++;
      a.number++;
      assert.strictEqual(a.number, 2);
      b.number++;
      assert.strictEqual(b.number, 1);
      assert.strictEqual(a.number, 2);
    });

    it('same \'@tracked\' properties of diffrent instances should not invalided cache of other instance', async () => {

      const getNumberSpy = spy();

      class Tester {
        @tracked number;
        name: string;

        constructor(name: string) {
          this.name = name;
        }

        @cache('number')
        async getNumber() {
          getNumberSpy(this.name);
          return this.number;
        }
      }

      const a = new Tester('A');
      a.number = 0;
      const b = new Tester('B');
      b.number = 0;

      assert.strictEqual((await a.getNumber()), 0);
      assert.strictEqual((await a.getNumber()), 0);
      assert.strictEqual((await b.getNumber()), 0);
      assert.strictEqual((await b.getNumber()), 0);
      assert.strictEqual(getNumberSpy.callCount, 2);
      assert.strictEqual(getNumberSpy.firstCall.firstArg, 'A');
      assert.strictEqual(getNumberSpy.secondCall.firstArg, 'B');
      getNumberSpy.resetHistory();

      a.number++;
      a.number++;
      assert.strictEqual((await a.getNumber()), 2);
      assert.strictEqual((await a.getNumber()), 2);
      assert.strictEqual((await b.getNumber()), 0);
      assert.strictEqual((await b.getNumber()), 0);
      assert.strictEqual(getNumberSpy.callCount, 1);
      assert.strictEqual(getNumberSpy.firstCall.firstArg, 'A');
      getNumberSpy.resetHistory();

      b.number++;
      assert.strictEqual((await a.getNumber()), 2);
      assert.strictEqual((await a.getNumber()), 2);
      assert.strictEqual((await b.getNumber()), 1);
      assert.strictEqual((await b.getNumber()), 1);
      assert.strictEqual(getNumberSpy.callCount, 1);
      assert.strictEqual(getNumberSpy.firstCall.firstArg, 'B');
      getNumberSpy.resetHistory();
    });
  });

});