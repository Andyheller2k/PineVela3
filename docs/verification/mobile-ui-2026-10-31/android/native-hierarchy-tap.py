from pathlib import Path
import subprocess,sys,json,xml.etree.ElementTree as ET,re,time
out=Path('/home/wyse/Documents/PineVela3/docs/verification/mobile-ui-2026-10-31/android')
adb='/home/wyse/Android/Sdk/platform-tools/adb'
label=sys.argv[1];name=sys.argv[2]
def run(args,timeout=25):
    return subprocess.run([adb,'-s','emulator-5554']+args,capture_output=True,timeout=timeout)
remote='/sdcard/pv-'+name+'.xml'
p=run(['shell','uiautomator','dump',remote],35)
p=run(['pull',remote,str(out/(name+'-before-ui.xml'))])
if p.returncode:raise SystemExit('Native hierarchy was not available')
nodes=[n for n in ET.parse(out/(name+'-before-ui.xml')).iter('node') if (n.attrib.get('text')==label or n.attrib.get('content-desc')==label) and n.attrib.get('clickable')=='true']
if len(nodes)!=1:
 print(json.dumps({'tapped':False,'reason':'Expected one exact native clickable control','label':label,'matches':len(nodes)}));raise SystemExit(1)
n=nodes[0];b=list(map(int,re.findall(r'\d+',n.attrib['bounds'])));point=[(b[0]+b[2])//2,(b[1]+b[3])//2]
p=run(['shell','input','tap',*map(str,point)])
record={'label':label,'nativeHierarchyBounds':n.attrib['bounds'],'nativePhysicalTap':point,'tapReturnCode':p.returncode,'javascriptClickUsed':False}
(out/(name+'-tap.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
time.sleep(3)
p=run(['exec-out','screencap','-p']);(out/(name+'-after.png')).write_bytes(p.stdout)
