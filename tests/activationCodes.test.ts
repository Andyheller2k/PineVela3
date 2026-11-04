import assert from 'node:assert/strict';
import test from 'node:test';
import { managerAuthorizationCode, roomActivationCode, roomCodePrefix, insertRoomActivationKeys } from '../supabase/activationCodes.js';

test('new codes are compact, preserve saved initials and use both letters and digits',()=>{
  assert.equal(roomCodePrefix('pm','Ignored name'),'PM');
  assert.equal(roomCodePrefix('PF-','Ignored name'),'PF');
  assert.equal(roomCodePrefix('','Pine Female'),'PF');
  assert.equal(roomCodePrefix('',''),'PV');
  const codes=new Set<string>();
  for(let i=0;i<500;i++){
    assert.match(managerAuthorizationCode(),/^[0-9]{6}$/);
    const code=roomActivationCode('PM');
    assert.match(code,/^PM-[A-HJ-NP-Z2-9]{4}$/);
    assert.match(code.slice(3),/[A-Z]/);assert.match(code.slice(3),/[2-9]/);
    codes.add(code);
  }
  assert(codes.size>490,'Random draws do not repeat systematically');
});

test('room-key collisions retry missing rows while preserving successful rows and cycle IDs',async()=>{
  let draws=0;
  const rows=[{id:'room-a',room_prefix:'pm',block_name:'Male',cycle_id:'cycle-a'},
    {id:'room-b',room_prefix:'pf',block_name:'Female',cycle_id:'cycle-b'}];
  const client={query:async(sql:string,values:any[])=>{
    if(sql.startsWith('select r.id'))return{rows};
    assert.match(sql,/on conflict \(code\) do nothing/);
    draws++;
    if(draws===1){assert.deepEqual(values[0],['room-a','room-b']);assert.match(values[1][0],/^PM-/);assert.match(values[1][1],/^PF-/);assert.deepEqual(values[2],['cycle-a','cycle-b']);return{rows:[{room_id:'room-a'}]};}
    assert.deepEqual(values[0],['room-b']);return{rows:[{room_id:'room-b'}]};
  }};
  await insertRoomActivationKeys(client as any,['room-a','room-b']);assert.equal(draws,2);
});

test('collision exhaustion is bounded and fails the enclosing transaction instead of returning partial success',async()=>{
  let draws=0;
  const client={query:async(sql:string)=>sql.startsWith('select r.id')?
    {rows:[{id:'room-a',room_prefix:'PM',block_name:'Male'}]}:(draws++,{rows:[]})};
  await assert.rejects(insertRoomActivationKeys(client as any,['room-a'],'cycle'),{status:503});
  assert.equal(draws,32);
});
