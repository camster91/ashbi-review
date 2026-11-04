import { describe, expect, it } from 'vitest';
import { percentagePoint } from '../src/PinLayer';
describe('image pin coordinates', () => {
  it('preserves the same anchor on differently scaled images', () => {
    expect(percentagePoint(250, 200, {left:50,top:100,width:800,height:400})).toEqual({x_pct:25,y_pct:25});
    expect(percentagePoint(100, 125, {left:50,top:100,width:200,height:100})).toEqual({x_pct:25,y_pct:25});
  });
  it('clamps boundary clicks to the image', () => {
    expect(percentagePoint(-10, 500, {left:0,top:0,width:100,height:100})).toEqual({x_pct:0,y_pct:100});
  });
});
