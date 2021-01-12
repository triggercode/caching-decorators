/*******************************************************************************
 * Types
*******************************************************************************/
type TMethodName = string;

type TTargetClassObject = object;

type TIsDirtyMap = {
  [methodName: string]: true;
};

type TPropertiesDependencies = {
  [propertyName: string]: TMethodName[];
};

interface ICacheDescriptor extends TypedPropertyDescriptor<any> {
  value?: () => Promise<any>;
}

/*******************************************************************************
 * Variables
*******************************************************************************/
const objectToDirtyStates = new WeakMap<object, TIsDirtyMap>();
const classObjectToDependencies = new WeakMap<TTargetClassObject, TPropertiesDependencies>();

/*******************************************************************************
 * Functions
*******************************************************************************/

/**
 * Update the dirty states for the property.
 */
function updateDirtyStates(targetClassObject: TTargetClassObject, targetObject: object, propertyName: string) {
  const dependencies = getDependencies(targetClassObject);
  setDirtyStates(targetObject, dependencies, propertyName);
}

/**
 * Initially builds the dependencies for the decorated targetObjects methodName.
 *
 * Example for the map *dependencies* that would be created with:
 *
 * @cache('firstName', 'lastName', 'data')
 * async getFullName () { ... }
 *
 * @cache('firstName')
 * async getNameSlug () { ... }
 *
 * {
 *   firstName: [getFullName, getNameSlug],
 *   lastName: [getFullName],
 *   data: [getFullName],
 *   ...: [getFullName],
 * }
 *
 * @param {...string} dependantProps - Depending properties on which the cache should be invalidated.
 * @param {object} targetClassObject - class object
 * @param {TMethodName} methodName - cache name
 */
function buildDependencies(dependantProps: string[], targetClassObject: TTargetClassObject, methodName: TMethodName) {
  const dependencies = getDependencies(targetClassObject);

  for (const dependantProp of dependantProps) {
    if (!dependencies[dependantProp]) {
      dependencies[dependantProp] = [methodName];
    } else {
      dependencies[dependantProp].push(methodName);
    }
  }
}

/**
 * Checks if a methodName is in the map that contains the state about all
 * dirty methods.
 */
function isCacheDirty(targetObject: object, methodName: TMethodName): boolean {
  const dirtyStates = objectToDirtyStates.get(targetObject);
  return !!dirtyStates && methodName in dirtyStates;
}

/**
 * Removes a methodName from the map that contains the dirty states
 */
function unsetIsCacheDirty(targetObject: object, methodName: TMethodName) {
  const dirtyStates = objectToDirtyStates.get(targetObject);

  if (dirtyStates && dirtyStates[methodName]) {
    delete dirtyStates[methodName];
  }
}

/**
 * Fetches the dependencies for all properties and methods of one targetObject
 */
function getDependencies(targetClassObject: TTargetClassObject) {
  let propertiesDependencies = classObjectToDependencies.get(targetClassObject);
  // if empty -> initialize map with empty object
  if (!propertiesDependencies) {
    propertiesDependencies = {};
    classObjectToDependencies.set(targetClassObject, propertiesDependencies);
  }

  return propertiesDependencies;
}

/**
 * Adds the dirty flag to the states map for the property and all of its
 * dependencies recursively.
 */
function setDirtyStates(targetObject: object, dependencies: TPropertiesDependencies, propOrMethod: string | TMethodName) {
  const methodNames = dependencies[propOrMethod];

  if (methodNames) {
    for (const methodName of methodNames) {
      setDirtyState(targetObject, methodName);
      setDirtyStates(targetObject, dependencies, methodName);
    }
  }
}

/**
 * Invalidates the cache by adding a true value for the methodName in the
 * dirty states map.
 */
function setDirtyState(targetObject: object, methodName: TMethodName) {
  let dirtyStates = objectToDirtyStates.get(targetObject);

  if (dirtyStates === undefined) {
    dirtyStates = {
      [methodName]: true
    };
    objectToDirtyStates.set(targetObject, dirtyStates);
  } else {
    dirtyStates[methodName] = true;
  }
}

/*******************************************************************************
 * Decorators
*******************************************************************************/

/**
 * Tracked changes of a property to reference them in the cache method decorator
 */
export function tracked(targetClassObject: TTargetClassObject, propertyName: string) {
  const objectToPropertyValue = new WeakMap<object, any>();
  Object.defineProperty(targetClassObject, propertyName, {
    configurable: true, // property can change the type
    get() {
      return objectToPropertyValue.get(this);
    },
    set(newValue) {
      if (this[propertyName] !== newValue) {
        updateDirtyStates(targetClassObject, this, propertyName);
      }
      objectToPropertyValue.set(this, newValue);
    }
  });
}

/**
 * Method decorator to cache the return value of the method. The method called only at first time and if one of depending properties changes.
 *
 * @param {...string} dependantProperties - Depending properties on which the cache should be invalidated.
 */
export function cache(...dependantProperties: string[]) {
  const targetObjectToCacheValue = new WeakMap<object, any>();

  return function (
    targetClassObject: TTargetClassObject,
    methodName: TMethodName,
    descriptor: ICacheDescriptor
  ) {
    if (!descriptor?.value || typeof descriptor.value !== 'function') {
      throw Error('No valid property descriptor value. Property descriptor value should be \'() => Promise<any>\'');
    }

    buildDependencies(dependantProperties, targetClassObject, methodName);
    const originalMethod = descriptor.value;

    descriptor.value = async function () {
      const targetObject = this;

      if (!targetObjectToCacheValue.has(targetObject) || isCacheDirty(targetObject, methodName)) {
        const cacheValue = await originalMethod.apply(targetObject);
        targetObjectToCacheValue.set(targetObject, cacheValue);
        unsetIsCacheDirty(targetObject, methodName);
        return cacheValue;
      }

      return targetObjectToCacheValue.get(targetObject);
    };
  };
}