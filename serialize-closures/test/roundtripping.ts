import { expect } from 'chai';
import { deserialize, serialize, BuiltinList, generateDefaultBuiltins } from '../src';
import * as vm from 'vm';
import { CustomSerializerList, CustomSerializerRecord, CustomDeserializerRecord, CustomDeserializerList } from '../src/customs';

describe('Roundtripping', () => {
  function roundtrip(value, builtins?: BuiltinList, customSerializers?: CustomSerializerList, customDeserializers?: CustomDeserializerList) {
    return deserialize(JSON.parse(JSON.stringify(serialize(value, builtins, customSerializers))), builtins, customDeserializers);
  }

  function expectRoundtrip(value, builtins?: BuiltinList) {
    expect(roundtrip(value, builtins)).to.deep.equal(value);
  }

  it("can round-trip primitives", () => {
    expectRoundtrip(10);
    expectRoundtrip("hi");
    expectRoundtrip(null);
    expectRoundtrip(undefined);
    expectRoundtrip(true);
  });

  it("can round-trip arrays of primitives", () => {
    expectRoundtrip([10, 40]);
    expectRoundtrip(["hi"]);
    expectRoundtrip([null]);
    expectRoundtrip([undefined]);
    expectRoundtrip([true]);
  });

  it("can round-trip simple objects", () => {
    expectRoundtrip({ 'hi': 'there' });
  });

  it("can round-trip shorthand objects", () => {
    let hi = 'hi';
    expectRoundtrip({ hi });
  });

  it("can round-trip class-like objects", () => {
    let obj = {};
    Object.defineProperty(obj, 'hi', { get: () => 'there' });
    expect(roundtrip(obj).hi).to.equal('there');
  });

  it("can round-trip dates", () => {
    expectRoundtrip(new Date("Thu, 28 Apr 2016 22:02:17 GMT"));
  });

  it("can round-trip regexes", () => {
    expectRoundtrip(/([^\s]+)/g);
  });

  it("can round-trip functions without closures", () => {
    expect(
      roundtrip(function (x) { return x; })(10))
      .to.equal(10);
  });

  it("can round-trip functions with closures", () => {
    let a = 10;
    let f: any = function (x) { return a + x; };
    f.__closure = () => ({ a });

    expect(roundtrip(f)(42)).to.equal(52);
  });

  it("can round-trip recursive functions", function () {
    let f: any = function (x) { return x < 5 ? f(x + 1) : x; };
    f.__closure = function () { return ({ f }); };
    expect(roundtrip(f)(1)).to.equal(5);
  });

  it("can round-trip accessors in objects", () => {
    let obj = {
      x: 'there',
      get() { return this.x }
    };
    expect(roundtrip(obj).get()).to.equal('there');
  });

  it("can round-trip named accessors in objects", () => {
    let obj = {
      x: 'there',
      get hi() { return this.x }
    };
    expect(roundtrip(obj).hi).to.equal('there');
  });

  it("can round-trip builtins", () => {
    expectRoundtrip(Math);
  });

  it("can round-trip constructors", () => {
    function Vector2(x, y) {
      this.x = x;
      this.y = y;
    }
    Vector2.prototype.lengthSquared = function() { return this.x * this.x + this.y * this.y; };
    let builder: any = () => new Vector2(3, 4);
    builder.__closure = () => ({ Vector2 });
    expect(roundtrip(builder)().lengthSquared()).to.equal(25);
  });

  it("can round-trip static methods", () => {
    var Person = /** @class */ (function () {
        var _a;
        var Person: any = function (name, email) {
            this.name = name;
            this.email = email;
        }
        Person.prototype.toString = function () {
            return this.name + " <" + this.email + ">";
        };
        Person.create = (_a = function (name, email) {
            return new Person(name, email);
        }, _a.__closure = () => ({ Person }), _a);
        return Person;
    }());

    var create: any = function () { return Person.create("Clark Kent", "clark.kent@gmail.com"); };
    create.__closure = () => ({ Person });

    expect(roundtrip(create)().toString()).to.equal(create().toString());
  });

  it("can round-trip custom builtins", () => {
    let myBuiltin = { value: "Oh hi Mark!" };
    expect(
      roundtrip(
        myBuiltin,
        [{ name: "myBuiltin", builtin: myBuiltin }]))
      .to.equal(myBuiltin);
  });

  it("works with vm.runInContext", () => {
    let context = vm.createContext();
    let evalImpl = code => vm.runInContext(code, context);
    let box = evalImpl('{ value: "Oh hi Mark!" }');
    let builtins = generateDefaultBuiltins(undefined, evalImpl);
    let roundtrippedBox = roundtrip(box, builtins);
    expect(roundtrippedBox).to.deep.equal(box);
    expect(Object.getPrototypeOf(roundtrippedBox))
      .to.equal(Object.getPrototypeOf(box));
  });

  it("elides twice-underscore-prefixed properties", () => {
    expect(roundtrip({ "__elide_this": 10 })).to.deep.equal({ });
  });

  it("accepts a custom `eval` implementation", () => {
    // This test serializes an object in the current context,
    // then creates a new context and deserializes the object
    // in that context. This represents the use-case of serializing
    // objects in one sandbox and deserializing them in another.
    let createBox = () => ({ value: "Oh hi Mark!" });
    let serialized = serialize(createBox);

    let context = vm.createContext({ generateDefaultBuiltins });
    let evalImpl = code => vm.runInContext(code, context);
    let builtins = evalImpl('generateDefaultBuiltins()');
    let deserializedBox = deserialize(serialized, builtins, [], evalImpl)();
    expect(deserializedBox).to.deep.equal(createBox());
    // Prototypes should be different because they originate
    // from different environments.
    expect(Object.getPrototypeOf(deserializedBox))
      .to.not.equal(Object.getPrototypeOf(createBox()));
    expect(Object.getPrototypeOf(deserializedBox))
      .to.equal(evalImpl("Object.prototype"));
  });

  it("can round-trip custom serializer", () => {
    // This test serializes an object using a custom serializer.
    // The goal is to deserialize the object using a mapping to the custom deserializer.
    let myValue = { value: "Oh hi Mark!" };
    let serializer : CustomSerializerRecord = {
      name: "mark-serializer",
      value: myValue,
      serializer: () => {
        return "My-JSON: "+JSON.stringify(myValue)
      }
    }
    let deserializer : CustomDeserializerRecord = {
      name: "mark-serializer",
      deserializer: (str: string) => {
        let stripped = str.substring("My-JSON: ".length)
        return JSON.parse(stripped)
      }
    }
    expect(
      JSON.stringify(roundtrip(
        myValue,
        [],
        [serializer], [deserializer])))
      .to.equal(JSON.stringify(myValue));
  });
});
