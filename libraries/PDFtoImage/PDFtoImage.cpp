//
// Created by a2882 on 2021/7/19.
//

#include "PDFtoImage.h"
#include <QDir>
#include <QDebug>

PDFtoImage::PDFtoImage(const QString& file_path)
{
    this->document = Poppler::Document::load(file_path);    //讀取文件

    this->num_pages = this->document->numPages();   // 紀錄頁數

    if (this->document->isLocked()) {   // 偵測PDF有沒有密碼
        qDebug() << "PDF file is lock";
        return;
    }

    for (int index = 0; index < this->document->numPages(); index++) {  //把每頁文件存在Vector裡，conversion_image 時統一處裡
        Poppler::Page *page = this->document->page(index);
        this->pages.append(page);
    }
}

PDFtoImage::~PDFtoImage() {
    delete this->document;
}

void PDFtoImage::conversion_image(const QString& output_path, const QString& file_name, int image_dpi, const QString& image_format) {

    int index = 1;  // 用來紀錄頁數用

    for (auto & page : this->pages) {
        auto image = page->renderToImage(image_dpi, image_dpi, -1, -1, -1); // 轉換為 QImage

        if (this->num_pages == 1) { // 為了名字美觀 當 PDF 只有一頁的時候當案名稱不會有頁數編號
            image.save(QDir(output_path + QDir::separator() + file_name + "." + image_format.toLower()).path());

//            qDebug() << QDir(output_path + QDir::separator() + file_name + "." + image_format).path();
        }
        else {  // 當案名稱有頁數
            image.save(QDir(output_path + QDir::separator()
                            + QString(file_name + "-%1." + image_format.toLower()).arg(QString::number(index))).path());

//            qDebug() << QDir(output_path + QDir::separator()
//                             + QString(file_name + "-%1." + image_format).arg(QString::number(index))).path();
        }
        index++;
    }

}


