# PDF工具

PDF工具可以把PDF文件轉換為圖片的格式，可以選擇要轉換的圖片格式以及DPI。

轉換圖片的時候會根據CPU的核心數量去進行分配轉檔任務，來加快多頁PDF的轉換速度。

# 編譯說明

## Ubuntu 

* Download Source Code
```
git clone https://github.com/IDK-Silver/PDF_Tool.git
```
* Install Qt5 
```
 sudo apt-get install qtbase5-dev qtchooser qt5-qmake qtbase5-dev-tools
```

* Install Poppler
```
sudo apt-get install poppler-utils libpoppler-qt5-dev libpoppler-cpp-dev
```

* Make directory 
```
cd PDF_Tool/ 
mkdir build 
cd build/
```

* Generate makefile and building
```
camke ..
make 
```

* Run APP
```
./PDF_Tool
```








