
type TIsDirtyMap = {
  [cacheName: string]: boolean;
};
type TPropertyCacheNameMap = {
  [propertyName: string]: string[];
};

interface ICacheDescriptor extends TypedPropertyDescriptor<any> {
  value?: () => Promise<any>;
}

const targetCacheMap = new WeakMap<object, TIsDirtyMap>();
const targetKeyCacheNameMap = new WeakMap<object, TPropertyCacheNameMap>();

/**
 * @param {object} target - class object
 * @param {string} cacheName - name of the cache to be checked if dirty
 * @return {boolean} is cache dirty
 */
function isCacheDirty(target: object, cacheName: string): boolean {
  const isDirtyMap = targetCacheMap.get(target);

  return isDirtyMap ? isDirtyMap[cacheName] : false;
}

/**
 * @param {object} target - class object
 * @param {string} cacheName - name of the cache to be invalidated
 */
function invalidateCache(target: object, cacheName: string) {
  let isDirtyMap = targetCacheMap.get(target);

  if (isDirtyMap === undefined) {
    isDirtyMap = {
      [cacheName]: true
    };
    targetCacheMap.set(target, isDirtyMap);
  } else {
    isDirtyMap[cacheName] = true;
  }
}

/**
 * @param {object} target - class object
 * @param {string} cacheName - updated cache name
 */
function cacheUpdated(target: object, cacheName: string) {
  const isDirtyMap = targetCacheMap.get(target);

  if (isDirtyMap && isDirtyMap[cacheName]) {
    delete isDirtyMap[cacheName];
  }
}

/**
 * @param {object} target - class object
 * @return {WeakMap<object, TPropertyCacheNameMap>}
 */
function getCacheNameMap(target: object) {
  let propertyMap = targetKeyCacheNameMap.get(target);
  if (!propertyMap) {
    propertyMap = {};
    targetKeyCacheNameMap.set(target, propertyMap);
  }

  return propertyMap;
}

/**
 * @param {...string} dependingProperties - Depending properties on which the cache should be invalidated.
 * @param {object} target - class object
 * @param {string} cacheName - cache name
 */
function buildPropertyCacheNameMap(dependingProperties: string[], target: object, cacheName: string) {
  const propertyCacheMap = getCacheNameMap(target);

  for (const propertyName of dependingProperties) {
    if (!propertyCacheMap[propertyName]) {
      propertyCacheMap[propertyName] = [cacheName];
    } else {
      propertyCacheMap[propertyName].push(cacheName);
    }
  }
  targetKeyCacheNameMap.set(target, propertyCacheMap);
}

/**
 * Invalidate all caches that are depending on this property. This function is recrucive.
 *
 * @param {object} target - class object
 * @param {TPropertyCacheNameMap} propertyCacheMap - class object
 * @param {string} propertyName - name of the dirty object property
 */
function invalidateCaches(target: object, propertyCacheMap: TPropertyCacheNameMap, propertyName: string) {
  const cachePropertyNames = propertyCacheMap[propertyName];

  if (cachePropertyNames) {
    for (const cachePropertyName of cachePropertyNames) {
      invalidateCache(target, cachePropertyName);
      invalidateCaches(target, propertyCacheMap, cachePropertyName);
    }
  }
}

/**
 * Invalidate all caches that are depending on this property
 *
 * @param {object} target - class object
 * @param {string} propertyName - name of the updated object property
 */
function propertyUpdated(target: object, propertyName: string) {
  const propertyCacheMap = getCacheNameMap(target);
  invalidateCaches(target, propertyCacheMap, propertyName);
}

/**
 * Method decorator to cache the return value of the method. The method called only at first time and if one of depending properties changes.
 *
 * @param {...string} dependingProperties - Depending properties on which the cache should be invalidated.
 */
export function cache(...dependingProperties: string[]) {
  let cacheValue: any;

  return function (
    target: object,
    key: string,
    descriptor: ICacheDescriptor
  ) {
    if (!descriptor?.value || typeof descriptor.value !== 'function') {
      throw Error('No valid property descriptor value. Property descriptor value should be \'() => Promise<any>\'');
    }

    buildPropertyCacheNameMap(dependingProperties, target, key);
    const originalMethod = descriptor.value.bind(target);

    descriptor.value = async () => {
      if (!cacheValue || isCacheDirty(target, key)) {
        cacheValue = await originalMethod();
        cacheUpdated(target, key);
      }

      return cacheValue;
    };
  };
}

/**
 * Tracked changes of a property to reference them in the cache method decorator
 *
 */
export function tracked(target: object, key: string) {
  let value: any;
  Object.defineProperty(target, key, {
    configurable: true,

    get() {
      return value;
    },
    set(newValue) {
      if (target[key] !== newValue) {
        propertyUpdated(target, key);
      }
      value = newValue;
    }
  });
}