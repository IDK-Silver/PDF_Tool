//
// Created by a2882 on 2021/7/19.
//

// You may need to build the project (run Qt uic code generator) to get "ui_PDFWidget.h" resolved

#include "PDFWidget.h"
#include "ui_PDFWidget.h"
#include <QDebug>
#include <QtWidgets/QFileDialog>
#include <algorithm>

PDFWidget::PDFWidget(QWidget *parent) :
        QWidget(parent), ui(new Ui::PDFWidget) {
    ui->setupUi(this);
    init();

    connect(this->ui->btn_addFile, SIGNAL(clicked()), SLOT(add_file()));
    connect(this->ui->btn_delFile, SIGNAL(clicked()), SLOT(del_file()));

}

PDFWidget::~PDFWidget() {
    delete ui;
    delete settings;
}

void PDFWidget::add_file() {
    // 取的選取的檔案
    auto choose_files =  QFileDialog::getOpenFileNames(this, "選取PDF檔", QDir::homePath().append("/Pictures"), "PDF檔 (*.pdf)");

    // 添加取的選取的檔案
    for (const auto& file : choose_files) {
        this->files.append(file);
    }

    // 進行排序
    std::sort(this->files.begin(), this->files.end());

    // 去除重複的檔案
    auto unique_file =  std::unique(files.begin(), files.end());
    this->files.resize((int)std::distance(this->files.begin(), unique_file));

    //清除畫面上的現有的選單檔案 添加上排序好的
    QStringList list(files.begin(), files.end());
    ui->listWidget->clear();
    ui->listWidget->addItems(list);
}

void PDFWidget::del_file() {
    // 讀取選取的選項
    auto select_file = ui->listWidget->selectedItems();

    // 刪除選單裡的選項
    for (auto &widget : select_file) {
        ui->listWidget->removeItemWidget(widget);
        delete widget;
    }
}


void PDFWidget::init() {
    this->settings = new Setting(section.section);

    // 檢查是否生成檔案
    if (!settings->is_file_generate()) {
        // 生成設定檔案
        settings->generate_file();
    }

    // 初始化 DPI 選項
    ui->comboBox_dpi->addItems(settings->read(section.key.dpi_list).toStringList());
    ui->comboBox_dpi->setCurrentText(settings->read(section.key.dpi).toString());

    // 初始化 圖片格式 選項
    ui->comboBox_format->addItems(settings->read(section.key.format_list).toStringList());
    ui->comboBox_format->setCurrentText(settings->read(section.key.format).toString());
}