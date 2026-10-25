import {AppError} from './providers.mjs';
export const MAX_IMAGES=6,MAX_IMAGE_BYTES=3*1024*1024,MAX_TOTAL_BYTES=12*1024*1024;
export function validateImages(input){
 const images=input.images??(input.image?[input.image]:[]);
 if(!Array.isArray(images)||images.length<1||images.length>MAX_IMAGES)throw new AppError('请上传 1–6 张截图。');
 let total=0;
 for(const image of images){
  if(typeof image!=='string'||image.length>4_194_400)throw new AppError('每张截图不得超过 3 MB。');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if(!match||match[2].length%4)throw new AppError('截图格式无效。');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>MAX_IMAGE_BYTES)throw new AppError('每张截图不得超过 3 MB。');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)throw new AppError('文件内容与图片格式不符。');total+=bytes.length;
 }
 if(total>MAX_TOTAL_BYTES)throw new AppError('全部截图合计不得超过 12 MB。');
 return images;
}
