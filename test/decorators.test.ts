import { cache, tracked } from '../src/decorators'
import { spy } from 'sinon';
import assert from 'assert';
import crypto from 'crypto';


function hashString(algorithm: string, input: string) {
  return crypto.createHash(algorithm).update(input).digest('hex')
}

const concatInputsSpy = spy();
const hashInputsSpy = spy();

class DecoratorsTest {
  @tracked public input1: string = "input1";
  @tracked public input2: string = "input2";

  @tracked public hashAlgorithm = "md5";

  @cache("input1", "input2")
  public async concatInputs() {
    concatInputsSpy();
    return this.input1.concat(this.input2);
  }

  @cache('concatInputs', "hashAlgorithm")
  public async hashInputs() {
    hashInputsSpy();
    return crypto.createHash(this.hashAlgorithm).update(await this.concatInputs()).digest('hex');
  }
}

describe('the \'decorators\' test', () => {
  const decoratorsTest = new DecoratorsTest();

  afterEach(() => {
    concatInputsSpy.resetHistory();
  })

  it('should cache values if no tracked property changes and should invalidate cache if a property changes', async () => {

    const res = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.strictEqual(res, "input1input2");

    const res2 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.strictEqual(res2, "input1input2");

    decoratorsTest.input1 = "new";
    const res3 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledTwice);
    assert.strictEqual(res3, "newinput2");

    const res4 = await decoratorsTest.concatInputs();
    assert.ok(concatInputsSpy.calledTwice);
    assert.strictEqual(res4, "newinput2");
  });

  it('should invalidate cache if it depends on other cache and the other cache is invalidated', async () => {
    const res = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.notCalled);
    assert.ok(hashInputsSpy.calledOnce);
    assert.strictEqual(res, hashString('md5', "newinput2"));

    const res2 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.notCalled);
    assert.ok(hashInputsSpy.calledOnce);
    assert.strictEqual(res2, hashString('md5', "newinput2"));

    decoratorsTest.hashAlgorithm = "sha256";
    const res3 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.notCalled);
    assert.ok(hashInputsSpy.calledTwice);
    assert.strictEqual(res3, hashString('sha256', "newinput2"));

    decoratorsTest.input2 = "new";
    const res4 = await decoratorsTest.hashInputs();
    assert.ok(concatInputsSpy.calledOnce);
    assert.ok(hashInputsSpy.calledThrice);
    assert.strictEqual(res4, hashString('sha256', "newnew"));
  })

});