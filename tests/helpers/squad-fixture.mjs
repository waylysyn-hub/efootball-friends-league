// Synthetic QA roster; never loaded by the production runtime.
export function presentationSquad() {
  const positions = ['GK','LB','CB','CB','RB','DMF','CMF','AMF','LWF','CF','RWF','GK','CB','LB','RB','LMF','RMF','CMF','AMF','DMF','SS','CF','LWF','RWF','SS'];
  const names = ['جانلويجي بوفون','باولو مالديني','أليساندرو نيستا','فابيو كانافارو','أشرف حكيمي','باتريك فييرا','تشافي هيرنانديز','زين الدين زيدان','رونالدينيو','زلاتان إبراهيموفيتش','ليونيل ميسي','مانويل نوير','فيرجيل فان دايك','روبرتو كارلوس','داني ألفيش','ستيفن جيرارد','كيفين دي بروين','لوكا مودريتش','أندريس إنييستا','فرانتس بيكنباور','أليساندرو ديل بييرو','ديدييه دروغبا','كريستيانو رونالدو','محمد صلاح','توماس مولر'];
  return positions.map((position, i) => ({
    id:`qa-roster-${i}`, owner:'Wael', name:names[i], position,
    lineup_role: i < 11 ? 'starter' : 'substitute',
    active:true, shirt_number:i+1,
    rating:i%4===0 ? null : 88+i%10, photo_url:null,
    created_at:'2026-09-30T06:00:00Z', updated_at:'2026-09-30T06:00:00Z'
  }));
}
