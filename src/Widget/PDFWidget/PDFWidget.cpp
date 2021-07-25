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

    if (!settings->is_file_generate()) {    // 檢查是否生成檔案
        settings->generate_file();  // 生成設定檔案
    }

    // 初始化 DPI 選項
    ui->comboBox_dpi->addItems(settings->read(section.key.dpi_list).toStringList());
    ui->comboBox_dpi->setCurrentText(settings->read(section.key.dpi).toString());

    // 初始化 圖片格式 選項
    ui->comboBox_format->addItems(settings->read(section.key.format_list).toStringList());
    ui->comboBox_format->setCurrentText(settings->read(section.key.format).toString());


}


