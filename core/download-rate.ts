/** Recent throughput, weighted by elapsed time; retained bytes are never counted again. */
export class DownloadRate {
  private samples: {bytes:number; milliseconds:number}[] = [];
  constructor(private received:number, private time:number) {}
  update(received:number, total:number|undefined, now:number): {bytesPerSecond:number; etaSeconds?:number} {
    const milliseconds=now-this.time, bytes=received-this.received;
    this.received=received;this.time=now;
    if(milliseconds<=0 || bytes<0){this.samples=[];return {bytesPerSecond:0};}
    this.samples.push({bytes,milliseconds});
    let duration=this.samples.reduce((sum,s)=>sum+s.milliseconds,0);
    while(duration>10000 && this.samples.length){
      const first=this.samples[0], excess=duration-10000;
      if(first.milliseconds<=excess){duration-=first.milliseconds;this.samples.shift();}
      else {first.bytes*=1-excess/first.milliseconds;first.milliseconds-=excess;duration=10000;}
    }
    const bytesPerSecond=bytes===0?0:this.samples.reduce((sum,s)=>sum+s.bytes,0)*1000/duration;
    const etaSeconds=duration>=3000 && bytesPerSecond>0 && total!==undefined && total>received
      ? Math.ceil((total-received)/bytesPerSecond):undefined;
    return {bytesPerSecond,etaSeconds};
  }
}
