import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reservationExpired} from '../orderReservationPolicy.js';
test('a reservation expires exactly at its deadline, without expiring terminal handovers',()=>{
  const deadline='2026-10-20T12:00:00.000Z',now=Date.parse(deadline);
  for(const status of ['awaiting_seller','pending_meetup']){assert.equal(reservationExpired(status,deadline,now-1),false);assert.equal(reservationExpired(status,deadline,now),true);assert.equal(reservationExpired(status,deadline,now+1),true);}
  for(const status of ['completed','cancelled','rejected','expired'])assert.equal(reservationExpired(status,deadline,now+1),false);
});
