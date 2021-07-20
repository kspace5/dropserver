const fs = require("fs");
const path = require('path');
const express = require('express');
const serveIndex = require('serve-index');
const Batch = require('batch');

function fileSort(a, b) {
  // sort ".." to the top
  if (a.name === '..' || b.name === '..') {
    return a.name === b.name ? 0
      : a.name === '..' ? -1 : 1;
  }

  return Number(b.stat && b.stat.isDirectory()) - Number(a.stat && a.stat.isDirectory()) ||
    String(a.name).toLocaleLowerCase().localeCompare(String(b.name).toLocaleLowerCase());
}

function stat(dir, files, cb) {
  let batch = new Batch();

  batch.concurrency(10);

  files.forEach(function (file) {
    batch.push(function (done) {
      fs.stat(path.join(dir, file), function (err, stat) {
        if (err && err.code !== 'ENOENT') return done(err);

        // pass ENOENT as null stat, not error
        done(null, {
          name: file,
          stat: stat || null
        })
      });
    });
  });

  batch.end(cb);
}

serveIndex.json = function _json(req, res, files, next, dir, showUp, icons, path) {
  // stat all files
  if (showUp) {
    files.unshift('..');
  }
  const port = req.app.get('port') || 8008;
  const hostURL = `${req.protocol}://${req.hostname}:${port}`;
  const dirPath = String(dir).replace(/[\/]{2,}/g, '/').replace(/[\/]+$/, '');
  const hostPathURL = `${hostURL}${dirPath}`;
  const currentPath = dirPath.replace('/api/list', '');

  stat(path, files, function (err, fileList) {
    if (err) return next(err)

    // sort file list
    fileList.sort(fileSort)

    // serialize
    let filesName = fileList.map(function (file) {
      if (file.stat && file.stat.isDirectory()) {
        return {
          modified: file.stat.mtime,
          size: null,
          key:`${currentPath}/${file.name}/`,
          url:`${hostPathURL}/${String(file.name).replace(/^[\/]+/ig, '')}`
        }
      } else {
        return {
          modified: file.stat.mtime,
          size: file.stat.size,
          key:`${currentPath}/${file.name}`,
          url:`${hostURL}${currentPath}/${file.name}`
         }
       }
    })

    res.send({
      fileList: filesName,
      apiURL: `${hostURL}/api/list`,
      dirURL: hostPathURL,
      inSubDir: currentPath !== '',
      currentPath
    });
  })
};


const router = express.Router();

router.use(function (req, res, next) {
  const uploadPath = req.app.get('uploadPath');
  req.headers['accept'] = 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
  return serveIndex(uploadPath)(req, res, next);
});

//support single file ls
router.use(function (req, res, next) {
 const uploadPath = req.app.get('uploadPath');
 const realFilePath = path.join(uploadPath, req.path);
 if(fs.existsSync(realFilePath)){
  let filePath = path.dirname(realFilePath);
  let fileName = path.basename(realFilePath);
  
  return serveIndex.json(req, res, [fileName], next, path.dirname(req.originalUrl) , filePath !== uploadPath ,[],  filePath );

 }else{
   next();   
 }
});



module.exports = router;
