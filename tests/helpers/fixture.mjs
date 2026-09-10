// Synthetic data only. This client is used exclusively by the test harness.
export const players = ['Wael','Omar','Abdul Rahim','Mohammad','Mustafa','Abdul Qader'];
export const ids = { season:'10000000-0000-4000-8000-000000000001', match:'20000000-0000-4000-8000-000000000001', group:'30000000-0000-4000-8000-000000000001', question:'40000000-0000-4000-8000-000000000001' };
export function fixtureClient({ profile = null, empty = false } = {}) {
  const db = {
    players: empty ? [] : players.map(name => ({ name,role:name === 'Wael' ? 'admin' : 'player',created:1 })),
    seasons: empty ? [] : [{id:ids.season,name:'Season 01',active:true,created:1}],
    matches: empty ? [] : [{id:ids.match,player1:'Wael',player2:'Omar',goals1:2,goals2:1,date:'2026-09-08',season_id:ids.season,timestamp:1000}],
    match_goal_events: empty ? [] : [{id:'e1',match_id:ids.match,owner:'Wael',scorer:'Zlatan Ibrahimović',assist:'Ronaldinho',minute:12,sort_order:0},{id:'e2',match_id:ids.match,owner:'Omar',scorer:'Didier Drogba',assist:'',minute:38,sort_order:1},{id:'e3',match_id:ids.match,owner:'Wael',scorer:'Zlatan Ibrahimović',assist:'Del Piero',minute:78,sort_order:2}],
    match_stats:[],standings:[],achievements: empty ? [] : [{player:'Wael',achievement_id:'first_win'}],
    questions: empty ? [] : [{id:ids.question,author:'Wael',body:'Who is ready for the next match?',closed:false,timestamp:1000}],answers:[],
    chat_groups:[{id:ids.group,name:'Matchday room',description:'Fixtures, results and the next challenge.',emoji:'⚽',created_by:'Wael',created_at:'2026-09-08T12:00:00Z'}],
    chat_group_members: ['Wael','Omar'].map(player=>({group_id:ids.group,player})),chat_invitations:[],
    chat_messages:[{id:'50000000-0000-4000-8000-000000000001',group_id:ids.group,author:'Omar',body:'That late winner! Ready for a rematch?',created_at:'2026-09-08T12:00:00Z'},{id:'50000000-0000-4000-8000-000000000002',group_id:ids.group,author:'Wael',body:'Same time tomorrow. See you on the pitch.',created_at:'2026-09-08T12:01:00Z'}],
  };
  let signedIn = profile;
  const calls = [], listeners = [], channels = [];
  const client = {
    db,calls,channels,fail:null,hold:null,
    auth:{
      async getSession(){return {data:{session:signedIn ? {user:{id:'fixture-user'}}:null},error:null};},
      async signInWithPassword({email}) { signedIn = players.find(name => name.toLowerCase().replaceAll(' ','-')+'@efootball-friends.example' === email) || null; client.emitAuth('SIGNED_IN'); return {data:{user:signedIn ? {id:'fixture-user'}:null},error:signedIn ? null : {status:400}}; },
      async signOut(){ if(client.fail === 'signout') return {error:{status:503}}; signedIn=null;client.emitAuth('SIGNED_OUT');return {error:null}; },
      onAuthStateChange(fn){ listeners.push(fn);return {data:{subscription:{unsubscribe(){listeners.splice(listeners.indexOf(fn),1);}}}}; },
    },
    emitAuth(event,name){if(name!==undefined)signedIn=name;listeners.forEach(fn=>fn(event,signedIn?{user:{id:'fixture-user'}}:null));},
    from(table){
      const filters=[],orders=[]; let operation='select',value,one=false,max=Infinity,columns='*';
      const query={
        select(c='*'){columns=c;return query;},eq(k,v){filters.push(row=>row[k]===v);return query;},neq(k,v){filters.push(row=>row[k]!==v);return query;},in(k,values){filters.push(row=>values.includes(row[k]));return query;},
        order(key,{ascending=true}={}){orders.push([key,ascending]);return query;},limit(n){max=n;return query;},or(){return query;},
        single(){one=true;return query;},maybeSingle(){one=true;return query;},insert(v){operation='insert';value=v;return query;},update(v){operation='update';value=v;return query;},delete(){operation='delete';return query;},
        async then(resolve,reject){
          try {
            calls.push({table,operation,columns,value});
            if(client.hold) await client.hold({table,operation});
            if(client.fail===table || client.fail===operation) return resolve({data:null,error:{status:503}});
            let rows=table==='player_accounts' ? (signedIn?[{name:signedIn}]:[]) : [...(db[table] || [])];
            rows=rows.filter(row=>filters.every(fn=>fn(row)));
            if(operation==='insert') { const values=(Array.isArray(value)?value:[value]).map(v=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),...v})); if(values.some(v=>db[table].some(r=>r.id===v.id)))return resolve({error:{code:'23505'}}); db[table].push(...values);rows=values; }
            if(operation==='update')rows.forEach(row=>Object.assign(row,value));
            if(operation==='delete')db[table]=db[table].filter(row=>!rows.includes(row));
            if(table==='chat_group_members' && columns.includes('chat_groups')) rows=rows.map(row=>({...row,chat_groups:db.chat_groups.find(group=>group.id===row.group_id)}));
            for(const [key,ascending] of orders.reverse()) rows.sort((a,b)=>(String(a[key]).localeCompare(String(b[key])))*(ascending?1:-1));
            rows=rows.slice(0,max);
            resolve({data:one ? rows[0] || null : rows.map(row=>({...row})),error:null});
          }catch(e){reject(e);}
        },
      };return query;
    },
    async rpc(name,args){calls.push({rpc:name,args});if(client.hold)await client.hold({rpc:name});if(client.fail==='rpc')return {error:{status:503}};
      if(name==='save_league_match'){const index=db.matches.findIndex(m=>m.id===args.match_data.id);if(index<0)db.matches.push(args.match_data);else db.matches[index]={...db.matches[index],...args.match_data};db.match_goal_events=db.match_goal_events.filter(e=>e.match_id!==args.match_data.id).concat(args.goal_events.map((e,i)=>({...e,id:crypto.randomUUID(),match_id:args.match_data.id,sort_order:i})));return {data:args.match_data.id,error:null};}
      if(name==='create_league_chat_group'){const group={id:args.group_id,name:args.group_name,description:args.group_description,emoji:args.group_emoji,created_by:signedIn};db.chat_groups.push(group);db.chat_group_members.push({group_id:group.id,player:signedIn});return {data:group,error:null};}
      return {data:null,error:null};
    },
    channel(name){const events=[];const channel={name,events,on(type,filter,callback){events.push({type,filter,callback});return channel;},subscribe(callback){callback?.('SUBSCRIBED');channels.push(channel);return channel;},unsubscribe(){}};return channel;},
    removeChannel(channel){const index=channels.indexOf(channel);if(index>=0)channels.splice(index,1);},
    emitTable(table,row){for(const channel of [...channels])for(const event of channel.events)if(event.filter.table===table)event.callback({new:row});},
  };
  return client;
}
