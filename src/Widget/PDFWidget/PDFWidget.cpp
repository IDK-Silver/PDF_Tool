//
// Created by a2882 on 2021/7/19.
//

// You may need to build the project (run Qt uic code generator) to get "ui_PDFWidget.h" resolved

#include "PDFWidget.h"
#include "ui_PDFWidget.h"
#include <QDebug>
#include <QtWidgets/QFileDialog>
#include "libraries/Setting/Setting.h"


PDFWidget::PDFWidget(QWidget *parent) :
        QWidget(parent), ui(new Ui::PDFWidget) {
    ui->setupUi(this);
    init();

    connect(this->ui->btn_addFile, SIGNAL(clicked()), SLOT(add_file()));

}

PDFWidget::~PDFWidget() {
    delete ui;
    delete settings;
}

void PDFWidget::add_file() {
    QFileDialog::getOpenFileNames(this, "選取PDF檔",QDir::homePath().append("/Pictures"), "PDF檔 (*.pdf)");
}

void PDFWidget::init() {
    this->settings = new Setting(section.section);

    if (!settings->is_file_generate()) {    // 生成設定檔案
        settings->generate_file();
    }
}


