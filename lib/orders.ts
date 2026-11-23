import {addDays, type Patient} from './domain.ts';

export type OrderKind = 'dme'|'medication';
export const orderStatuses = ['requested','confirmed','in_transit','received','delayed','cancelled'] as const;
export type OrderStatus = typeof orderStatuses[number];
export type SupplyOrder = {
  id:string; patientId:string; kind:OrderKind; item:string; supplier:string; reference:string;
  neededBy:string; owner:string; status:OrderStatus; createdAt:string; updatedAt:string;
  history:{status:OrderStatus; at:string; by:string; reason?:string}[];
};
// Coordination states are internal workflow labels, not CMS billing or clinical codes.
export const orderStatusLabels:Record<OrderStatus,string> = {
  requested:'order.requested',confirmed:'order.confirmed',in_transit:'order.inTransit',
  received:'order.received',delayed:'order.delayed',cancelled:'order.cancelled',
};
export function orderClosed(order:SupplyOrder){return order.status==='received'||order.status==='cancelled';}
export function orderAttention(order:SupplyOrder,today:string){return !orderClosed(order)&&(order.status==='delayed'||order.neededBy<today);}
export function nextOrderStatus(status:OrderStatus):OrderStatus|undefined {
  return ({requested:'confirmed',confirmed:'in_transit',in_transit:'received',delayed:'confirmed'} as Partial<Record<OrderStatus,OrderStatus>>)[status];
}
export const ORDER_DEMO_PREFIX='demo-order-';
export function createOrderDemo(patients:Patient[],today:string):SupplyOrder[]{
  const demo=patients.filter(p=>p.number.startsWith('DEMO-HMD-')).sort((a,b)=>a.number.localeCompare(b.number)).slice(0,12);
  if(demo.length!==12)throw new Error('order.demoPatientsRequired');
  const items={dme:['Hospital bed','Pressure-reducing support surface','Wheelchair','Walker'],medication:['Acetaminophen — existing prescription','Senna — existing prescription','Ondansetron — existing prescription','Existing prescription refill']};
  return (['dme','medication'] as const).flatMap(kind=>demo.map((p,i)=>{
    const status=orderStatuses[i%orderStatuses.length],createdAt=addDays(today,-3)+'T16:00:00Z',updatedAt=addDays(today,-1)+'T16:00:00Z';
    return {id:`${ORDER_DEMO_PREFIX}${kind}-${String(i+1).padStart(3,'0')}`,patientId:p.id,kind,item:items[kind][i%4],supplier:kind==='dme'?'Demo DME supplier':'Demo hospice pharmacy',reference:`DEMO-${kind.toUpperCase()}-${String(i+1).padStart(3,'0')}`,neededBy:addDays(today,i%3-1),owner:p.owner,status,createdAt,updatedAt,
      history:[{status:'requested' as const,at:createdAt,by:'Demo coordinator'},...(status==='requested'?[]:[{status,at:updatedAt,by:'Demo coordinator',...(['delayed','cancelled'].includes(status)?{reason:'order.demoException'}:{})}])]};
  }));
}
