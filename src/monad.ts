import {Applicative, ApplicativeDictionary} from "./applicative";
import {foldr} from "./foldable";
import {Traversable} from "./traversable";
import {mixin, id, arrayFlatten} from "./utils";

export interface Monad<A> extends Applicative<A> {
  multi: boolean;
  chain<B>(f: (a: A) => Monad<B>): Monad<B>;
  flatten<B>(): Monad<B>;
}

export interface MonadDictionary extends ApplicativeDictionary {
  multi: boolean;
}

export abstract class AbstractMonad<A> implements Monad<A> {
  abstract multi: boolean;
  abstract of<B>(b: B): Monad<B>;
  chain<B>(f: (a: A) => Monad<B>): Monad<B> {
    return this.map(f).flatten();
  }
  flatten<B>(): Monad<B> {
    return this.chain(id);
  }
  map<B>(f: (a: A) => B): Monad<B> {
    return this.chain((a: A) => this.of(f(a)));
  }
  mapTo<B>(b: B): Monad<B> {
    return this.chain((_) => this.of(b));
  }
  ap<B>(m: Monad<(a: A) => B>): Monad<B> {
    return m.chain((f) => this.chain((a) => this.of(f(a))));
  }
  lift<T1, R>(f: (t: T1) => R, m: Applicative<T1>): Applicative<R>;
  lift<T1, T2, R>(f: (t: T1, u: T2) => R, m1: Applicative<T1>, m2: Applicative<T2>): Applicative<R>;
  lift<T1, T2, T3, R>(f: (t1: T1, t2: T2, t3: T3) => R, m1: Applicative<T1>, m2: Applicative<T2>, m3: Applicative<T3>): Applicative<R>;
  lift(f: Function, ...ms: any[]): Monad<any> {
    const {of} = ms[0];
    switch (f.length) {
    case 1:
      return ms[0].map(f);
    case 2:
      return ms[0].chain((a: any) => ms[1].chain((b: any) => of(f(a, b))));
    case 3:
      return ms[0].chain((a: any) => ms[1].chain((b: any) => ms[2].chain((c: any) => of(f(a, b, c)))));
    }
  }
}

export function monad(constructor: Function): void {
  const p = constructor.prototype;
  if (!("of" in p)) {
    throw new TypeError("Can't derive monad. `of` method missing.");
  }
  if (!("chain" in p) && !("flatten" in p && "map" in p)) {
    throw new TypeError("Can't derive monad. Either `chain` or `flatten` and `map` method must be defined.");
  }
  if (!("multi" in p)) {
    p.multi = false;
  }
  if (!("multi" in constructor)) {
    (<any>constructor).multi = false;
  }
  mixin(constructor, [AbstractMonad]);
}

export function flatten<A>(m: A[][]): A[];
export function flatten<A>(m: Monad<Monad<A>>): any;
export function flatten<A>(m: Monad<Monad<A>> | A[][]): Monad<A> | A[] {
  if (Array.isArray(m)) {
    return arrayFlatten(m);
  } else {
    return m.flatten();
  }
}

function arrayChain<A, B>(f: (a: A) => B[], m: A[]): B[] {
  let result: B[] = [];
  for (let i = 0; i < m.length; ++i) {
    const added = f(m[i]);
    for (let j = 0; j < added.length; ++j) {
      result.push(added[j]);
    }
  }
  return result;
}

export function chain<A, B>(f: (a: A) => B[], m: A[]): B[];
export function chain<A, B>(f: (a: A) => Monad<B>, m: Monad<A>): any;
export function chain<A, B>(f: any, m: Monad<Monad<A>> | A[]): Monad<B> | B[] {
  if (Array.isArray(m)) {
    return arrayChain<A, B>(f, m);
  } else {
    return m.chain(f);
  }
}

function singleGo(doing: Iterator<Monad<any>>, m: Monad<any>): Monad<any> {
  function doRec(v: any): any {
    const result = doing.next(v);
    if (result.done === true) {
      return m.of(result.value);
    } else if (typeof result.value !== "undefined") {
      return result.value.chain(doRec);
    } else {
      throw new Error("Expected monad value");
    }
  }
  return m.chain(doRec);
};

function multiGo<M extends Monad<any>>(gen: () => Iterator<M>, m: M): Monad<any> {
  const doRec = function(v: any, stateSoFar: any): any {
    const doing = gen();
    for (const it of stateSoFar) {
      doing.next(it);
    }
    const result = doing.next(v);
    if (result.done === true) {
      return m.of(result.value);
    } else {
      const newStateSoFar = stateSoFar.concat(v);
      return result.value.chain((vv) => doRec(vv, newStateSoFar));
    }
  };
  return m.chain((vv) => doRec(vv, [undefined]));
};

export function go<M extends Monad<any>>(gen: () => Iterator<M>): any {
  const iterator = gen();
  const result = iterator.next();
  const monad = result.value;
  if (result.done === true) {
    return monad;
  } else if (monad.multi === true) {
    return multiGo(gen, monad);
  } else {
    return singleGo(iterator, monad);
  }
}

export function fgo(gen: (...a: any[]) => Iterator<Monad<any>>) {
  let m: Monad<any>;
  return (...args: any[]) => {
    const doing = gen(...args);
    function doRec(v: any): any {
      const a = doing.next(v);
      if (a.done === true) {
        return m.of(a.value);
      } else if (typeof a.value !== "undefined") {
        m = a.value;
        return a.value.chain(doRec);
      } else {
        throw new Error("Expected monad value");
      }
    }
    return doRec(undefined);
  };
}
