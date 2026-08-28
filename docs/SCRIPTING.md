# 3D Glider Scripting Guide

The 3D Glider application supports JavaScript scripting to programmatically build 3D models. This allows you to automate repetitive tasks and create complex models using code.

## Opening the Script Editor

Click the **`<>` Script** button in the toolbar to open the Script Editor. Here you can write JavaScript code that will be executed in the context of your 3D model.

## Basic Example

```javascript
// Create a simple box
await api.startSketch('XY');
await api.addRect(-1, -1, 1, 1);
await api.exitSketch();
await api.addExtrude('last', 2);
```

## Core API Reference

### Sketch Operations

#### `startSketch(plane, offset?)`
Start a new sketch on a standard plane or custom plane pose.

**Parameters:**
- `plane`: `'XY' | 'XZ' | 'YZ' | SketchPlanePose` - The sketch plane
- `offset?`: `number` - Optional offset from the plane

**Example:**
```javascript
await api.startSketch('XY');
await api.startSketch('XZ', 5);  // Offset by 5 units
```

#### `exitSketch()`
Exit the current sketch and save it to the model. Returns the saved sketch ID.

**Example:**
```javascript
const sketchId = await api.exitSketch();
```

#### `editSketch(sketchName)`
Edit an existing sketch by name or ID.

**Example:**
```javascript
await api.editSketch('ProfileSketch');
```

### Drawing Elements

#### `addLine(x1, y1, x2, y2, construction?)`
Add a line from (x1, y1) to (x2, y2).

**Parameters:**
- `x1, y1, x2, y2`: `number` - Endpoints in sketch coordinates
- `construction?`: `boolean` - Make it a construction line (default: false)

**Returns:** Element ID (string)

**Example:**
```javascript
await api.addLine(0, 0, 5, 5);
await api.addLine(0, 0, 5, 0, true);  // Construction line
```

#### `addRect(x1, y1, x2, y2, construction?)`
Add a rectangle from (x1, y1) to (x2, y2).

**Parameters:**
- `x1, y1, x2, y2`: `number` - Opposite corners
- `construction?`: `boolean` - Make it a construction rectangle

**Returns:** Element ID

**Example:**
```javascript
await api.addRect(0, 0, 5, 3);
```

#### `addCircle(x, y, radius, construction?)`
Add a circle at (x, y) with given radius.

**Parameters:**
- `x, y`: `number` - Center in sketch coordinates
- `radius`: `number` - Circle radius
- `construction?`: `boolean` - Make it a construction circle

**Returns:** Element ID

**Example:**
```javascript
await api.addCircle(0, 0, 2.5);
```

### Constraints

#### `addConstraint(constraint)`
Add a geometric or dimensional constraint.

**Constraint Types:**

##### Length Constraint
```javascript
await api.addConstraint({
  type: 'length',
  elementId: lineId,
  value: 10
});
```

##### Horizontal/Vertical
```javascript
await api.addConstraint({
  type: 'horizontal',
  elementId: lineId
});

await api.addConstraint({
  type: 'vertical',
  elementId: lineId
});
```

##### Parallel/Perpendicular
```javascript
await api.addConstraint({
  type: 'parallel',
  elementId1: line1Id,
  elementId2: line2Id
});

await api.addConstraint({
  type: 'perpendicular',
  elementId1: line1Id,
  elementId2: line2Id
});
```

##### Equal Length
```javascript
await api.addConstraint({
  type: 'equal',
  elementId1: line1Id,
  elementId2: line2Id
});
```

##### Angle
```javascript
await api.addConstraint({
  type: 'angle',
  elementId1: line1Id,
  elementId2: line2Id,
  value: 45  // degrees
});
```

### 3D Features

#### `addExtrude(sketchName, depth, operation?, direction?, symmetric?)`
Create an extrusion from a sketch.

**Parameters:**
- `sketchName`: `string` - Sketch name/ID (pass `'last'` for the most recently created sketch)
- `depth`: `number` - Extrusion depth
- `operation?`: `'add' | 'cut'` - Add or cut (default: 'add')
- `direction?`: `[x, y, z]` - World-space direction vector
- `symmetric?`: `boolean` - Extrude depth/2 on each side

**Returns:** Feature ID

**Example:**
```javascript
await api.addExtrude('last', 5);
await api.addExtrude('BaseSketch', 10, 'add');
await api.addExtrude('BaseSketch', 3, 'cut', undefined, true);  // Symmetric cut
```

#### `addRevolve(sketchName?, axisType?, angle?, axisElementId?)`
Create a revolution/revolve feature.

**Parameters:**
- `sketchName?`: `string` - Sketch name/ID
- `axisType?`: `'x' | 'y' | 'z' | 'element'` - Axis type
- `angle?`: `number` - Revolution angle in degrees (1-360)
- `axisElementId?`: `string` - When axisType='element', the axis line ID

**Example:**
```javascript
await api.addRevolve('last', 'z', 360);
await api.addRevolve('ProfileSketch', 'x', 180);
```

#### `addLoft(sketch1Name, sketch2Name, operation?)`
Create a loft between two sketches.

**Parameters:**
- `sketch1Name`: `string` - First sketch name/ID
- `sketch2Name`: `string` - Second sketch name/ID
- `operation?`: `'add' | 'cut'`

**Example:**
```javascript
await api.addLoft('BottomSketch', 'TopSketch', 'add');
```

#### `addSweep(profileSketchName, pathSketchName, operation?)`
Create a sweep feature.

**Parameters:**
- `profileSketchName`: `string` - Profile sketch
- `pathSketchName`: `string` - Path sketch
- `operation?`: `'add' | 'cut'`

**Example:**
```javascript
await api.addSweep('CircleProfile', 'SplinePath', 'add');
```

### Parameters

#### `addParameter(name, value)`
Add a named parameter to the model.

**Parameters:**
- `name`: `string` - Parameter name
- `value`: `number` - Parameter value

**Returns:** Parameter ID

**Example:**
```javascript
await api.addParameter('length', 10);
await api.addParameter('width', 5);
```

#### `updateParameter(nameOrId, newValue?, newName?)`
Update an existing parameter.

**Example:**
```javascript
await api.updateParameter('length', 15);
```

### Appearance

#### `setSketchColor(sketchName, color, opacity?)`
Set the color and opacity of a sketch.

**Parameters:**
- `sketchName`: `string` - Sketch name/ID
- `color`: `string` - Hex color code (e.g., '#ff0000')
- `opacity?`: `number` - 0-1

**Example:**
```javascript
await api.setSketchColor('BaseSketch', '#ff0000', 0.8);
```

#### `setSketchName(sketchIdOrName, name)`
Set or rename a sketch.

**Example:**
```javascript
await api.setSketchName('last', 'ProfileSketch');
```

### Query Operations

These don't require await:

#### `getSketches()`
Get all sketches in the model.

#### `getParameters()`
Get all parameters.

#### `getExtrudes()`
Get all extrudes.

**Example:**
```javascript
const sketches = api.getSketches();
console.log(sketches.length);
```

## Advanced Examples

### Create a Parametric Bolt Head

```javascript
// Parameters
const hexSize = 10;
const threadDiameter = 8;
const headHeight = 6;
const threadDepth = -2;

await api.addParameter('hexSize', hexSize);
await api.addParameter('threadDiameter', threadDiameter);

// Hex profile
await api.startSketch('XY');
// Draw a hexagon (simplified as a circle for this example)
await api.addCircle(0, 0, hexSize / 2);
await api.exitSketch();

// Extrude to head height
await api.addExtrude('last', headHeight, 'add');

// Thread profile
await api.startSketch('XZ', hexSize);
await api.addCircle(0, 0, threadDiameter / 2);
await api.exitSketch();

// Revolve around Z
await api.addRevolve('last', 'z', 360);
```

### Create a Tapered Shape

```javascript
// Bottom sketch
await api.startSketch('XY');
await api.addRect(-5, -5, 5, 5);
await api.exitSketch();
await api.addExtrude('last', 2);

// Top sketch (smaller)
await api.startSketch('XZ', 2);
await api.addRect(-2, -2, 2, 2);
await api.exitSketch();

// Loft between them
await api.addLoft('1', '2', 'add');
```

## Tips & Tricks

1. **Named Sketches**: After creating a sketch, use `setSketchName` to give it a meaningful name:
   ```javascript
   await api.exitSketch();
   await api.setSketchName('last', 'BaseProfile');
   ```

2. **Parameters in Constraints**: Use parameter references for parametric constraints (see API docs).

3. **Console Output**: Use `console.log()` to debug:
   ```javascript
   console.log('Total sketches:', api.getSketches().length);
   ```

4. **Error Handling**: Script errors are displayed in the Output panel. Check the panel for error messages.

5. **UI Updates**: After running a script, the viewport updates automatically.

## Common Errors

- **"No active sketch"**: You must call `startSketch()` before adding elements
- **"Sketch not found"**: Check sketch names/IDs are spelled correctly
- **"No last sketch"**: Make sure you exited a sketch before referencing 'last'

## Performance

- Large scripts with many constraints may take a few seconds to execute
- Start simple and build up complexity
- Use construction geometry for helper lines
