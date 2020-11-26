
type TIsDirtyMap = {
  [cacheName: string]: boolean;
}
type TPropertyCacheNameMap = {
  [propertyName: string]: string[];
}

const targetCacheMap = new WeakMap<object, TIsDirtyMap>()
const targetKeyCacheNameMap = new WeakMap<object, TPropertyCacheNameMap>();

function isCacheDirty(target: object, key: string): boolean {
  const isDirtyMap = targetCacheMap.get(target);

  return isDirtyMap ? isDirtyMap[key] : false;
}

function invalidateCache(target, cacheName: string) {
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

function cacheUpdated(target, cacheName: string) {
  const isDirtyMap = targetCacheMap.get(target);

  if (isDirtyMap && isDirtyMap[cacheName]) {
    delete isDirtyMap[cacheName];
  }
}


function getCacheNameMap(target) {
  let propertyMap = targetKeyCacheNameMap.get(target);
  if (!propertyMap) {
    propertyMap = {};
    targetKeyCacheNameMap.set(target, propertyMap);
  }

  return propertyMap;
}

function buildPropertyCacheNameMap(properties: string[], target, cacheName: string) {
  const propertyCacheMap = getCacheNameMap(target);

  for (const propertyName of properties) {
    if (!propertyCacheMap[propertyName]) {
      propertyCacheMap[propertyName] = [cacheName];
    } else {
      propertyCacheMap[propertyName].push(cacheName);
    }
  }
  targetKeyCacheNameMap.set(target, propertyCacheMap);
}

function invalidateCaches(target, propertyCacheMap: TPropertyCacheNameMap, propertyName) {
  const cachePropertyNames = propertyCacheMap[propertyName];

  if (cachePropertyNames) {
    for (const cachePropertyName of cachePropertyNames) {
      invalidateCache(target, cachePropertyName);
      invalidateCaches(target, propertyCacheMap, cachePropertyName);
    }
  }
}

function propertyUpdated(target, propertyName: string) {
  const propertyCacheMap = getCacheNameMap(target);
  invalidateCaches(target, propertyCacheMap, propertyName);
}

export function cache(...fieldNames: string[]) {
  let cache;

  return function (
    target,
    key: string,
    descriptor: PropertyDescriptor
  ) {

    buildPropertyCacheNameMap(fieldNames, target, key);
    const originalMethod = descriptor.value.bind(target);

    descriptor.value = async () => {
      if (!cache || isCacheDirty(target, key)) {
        cache = await originalMethod();
        cacheUpdated(target, key);
      }

      return cache;
    }
  };
}

export function tracked(target, key: string) {
  let value;
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
  })
}