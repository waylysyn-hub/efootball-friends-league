// Synthetic QA roster; never loaded by the production runtime.
export function presentationSquad() {
  const positions = ['GK', ...Array(9).fill('DF'), ...Array(8).fill('MF'), ...Array(4).fill('FW'), 'SUB', 'SUB', 'UNK'];
  const names = ['جانلويجي بوفون', 'أليساندرو نيستا', 'باولو مالديني', 'روبرتو كارلوس', 'فابيو كانافارو', 'فرانتس بيكنباور', 'فيرجيل فان دايك', 'أشرف حكيمي', 'أليساندرو باستوني', 'سيرخيو راموس', 'أندريس إنييستا', 'تشافي هيرنانديز', 'لوكا مودريتش', 'زين الدين زيدان', 'باتريك فييرا', 'أندريا بيرلو', 'ستيفن جيرارد', 'كيفين دي بروين', 'زلاتان إبراهيموفيتش', 'ليونيل ميسي', 'كريستيانو رونالدو', 'ديدييه دروغبا', 'رونالدينيو', 'أليساندرو ديل بييرو', 'لاعب تجريبي بدون مركز'];
  return positions.map((position, i) => ({id:`qa-roster-${i}`, owner:'Wael', name:names[i], position, active:true, shirt_number:i+1,
    rating:i%4===0 ? null : 88+i%10, photo_url:null, created_at:'2026-09-30T06:00:00Z', updated_at:'2026-09-30T06:00:00Z'}));
}
