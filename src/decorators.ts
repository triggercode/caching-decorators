
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

function isCacheDirty(target: object, key: string): boolean {
  const isDirtyMap = targetCacheMap.get(target);

  return isDirtyMap ? isDirtyMap[key] : false;
}

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

function cacheUpdated(target: object, cacheName: string) {
  const isDirtyMap = targetCacheMap.get(target);

  if (isDirtyMap && isDirtyMap[cacheName]) {
    delete isDirtyMap[cacheName];
  }
}

function getCacheNameMap(target: object) {
  let propertyMap = targetKeyCacheNameMap.get(target);
  if (!propertyMap) {
    propertyMap = {};
    targetKeyCacheNameMap.set(target, propertyMap);
  }

  return propertyMap;
}

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

function invalidateCaches(target: object, propertyCacheMap: TPropertyCacheNameMap, propertyName) {
  const cachePropertyNames = propertyCacheMap[propertyName];

  if (cachePropertyNames) {
    for (const cachePropertyName of cachePropertyNames) {
      invalidateCache(target, cachePropertyName);
      invalidateCaches(target, propertyCacheMap, cachePropertyName);
    }
  }
}

function propertyUpdated(target: object, propertyName: string) {
  const propertyCacheMap = getCacheNameMap(target);
  invalidateCaches(target, propertyCacheMap, propertyName);
}

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